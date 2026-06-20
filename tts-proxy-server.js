#!/usr/bin/env node
/**
 * Edge TTS HTTP 代理服务
 * 将 Edge TTS WebSocket 协议封装为 HTTP API，返回 MP3
 * 
 * POST /tts  body: { text, voice, rate, volume, pitch }
 * GET  /voices  返回可用音色列表
 */

const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 9095;

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_VER = '143.0.3650.75';
const WIN_EPOCH = 11644473600;

// 音色列表
const VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（普通话·女）' },
  { id: 'zh-CN-YunxiNeural', name: '云希（普通话·男）' },
  { id: 'zh-CN-YunjianNeural', name: '云健（普通话·男）' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（普通话·女）' },
  { id: 'zh-CN-XiaoxuanNeural', name: '晓萱（普通话·女）' },
  { id: 'zh-CN-YunyangNeural', name: '云扬（普通话·男）' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏（普通话·男）' },
  { id: 'zh-TW-HsiaoChenNeural', name: '晓辰（台湾腔·女）' },
  { id: 'zh-TW-YunJheNeural', name: '云哲（台湾腔·男）' },
  { id: 'zh-HK-WanLungNeural', name: '云龙（粤语·男）' },
  { id: 'zh-HK-HiuGaaiNeural', name: '曉佳（粤语·女）' },
  { id: 'en-US-EmmaMultilingualNeural', name: 'Emma（英语·女）' },
  { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew（英语·男）' },
  { id: 'ja-JP-NanamiNeural', name: '七海（日语·女）' },
  { id: 'ko-KR-SunHiNeural', name: '善熙（韩语·女）' },
];

function generateSecMsGec() {
  var ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  var hash = crypto.createHash('sha256')
    .update(ticks.toFixed(0) + TRUSTED_TOKEN)
    .digest();
  return hash.toString('hex').toUpperCase();
}

function synthesize(text, voice, rate, volume, pitch) {
  return new Promise(function (resolve, reject) {
    var connId = crypto.randomBytes(16).toString('hex');
    var secMsGec = generateSecMsGec();
    var wsUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' +
      TRUSTED_TOKEN + '&Sec-MS-GEC=' + secMsGec +
      '&Sec-MS-GEC-Version=1-' + CHROMIUM_VER +
      '&ConnectionId=' + connId;

    var ws = new WebSocket(wsUrl, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpodibpecjkagmmoghkfhbd',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + CHROMIUM_VER + ' Safari/537.36 Edg/' + CHROMIUM_VER,
      },
    });

    var audioChunks = [];
    var hasAudio = false;
    var timer = setTimeout(function () {
      ws.terminate();
      reject(new Error('合成超时（15秒）'));
    }, 15000);

    ws.on('open', function () {
      clearTimeout(timer);
      var dateStr = new Date()
        .toUTCString()
        .replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

      // 配置
      ws.send(
        'X-Timestamp:' + dateStr + '\r\n' +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
      );

      // 音色名
      var parts = voice.split('-');
      var lang = parts.slice(0, 2).join('-');
      var name = parts.slice(2).join('-');
      var fullVoice = 'Microsoft Server Speech Text to Speech Voice (' + lang + ', ' + name + ')';

      // SSML
      var safeText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&apos;')
        .replace(/"/g, '&quot;');

      var ssml =
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>" +
        "<voice name='" + fullVoice + "'>" +
        "<prosody pitch='" + pitch + "' rate='" + rate + "' volume='" + volume + "'>" +
        safeText + "</prosody></voice></speak>";

      ws.send(
        'X-RequestId:' + connId + '\r\n' +
        'Content-Type:application/ssml+xml\r\n' +
        'X-Timestamp:' + dateStr + 'Z\r\n' +
        'Path:ssml\r\n\r\n' + ssml
      );
    });

    ws.on('message', function (data) {
      if (typeof data === 'string') {
        if (data.indexOf('Path:turn.end') !== -1) {
          setTimeout(function () { ws.terminate(); }, 300);
        }
      } else if (Buffer.isBuffer(data) && data.length > 2) {
        var hLen = data.readUInt16LE(0);
        if (data.length > hLen + 2) {
          var audio = data.slice(hLen + 2);
          if (audio.length > 0) {
            audioChunks.push(audio);
            hasAudio = true;
          }
        }
      }
    });

    ws.on('error', function (err) {
      clearTimeout(timer);
      reject(new Error('WebSocket 连接失败: ' + err.message));
    });

    ws.on('close', function () {
      clearTimeout(timer);
      if (hasAudio) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(new Error('合成失败：未收到音频'));
      }
    });
  });
}

var server = http.createServer(async function (req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 音色列表
  if (req.method === 'GET' && req.url === '/voices') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(VOICES));
    return;
  }

  // 语音合成
  if (req.method === 'POST' && req.url === '/tts') {
    var body = '';
    await new Promise(function (resolve) {
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', resolve);
    });

    var params;
    try { params = JSON.parse(body); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('无效的 JSON');
      return;
    }

    if (!params.text) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('缺少 text 参数');
      return;
    }

    var voice = params.voice || 'zh-CN-XiaoxiaoNeural';
    var rate = params.rate || '+0%';
    var volume = params.volume || '+0%';
    var pitch = params.pitch || '+0Hz';

    console.log('[TTS] ' + new Date().toISOString() + ' | ' + voice + ' | ' + params.text.slice(0, 50));

    try {
      var audio = await synthesize(params.text, voice, rate, volume, pitch);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Content-Disposition': 'inline; filename="tts.mp3"',
      });
      res.end(audio);
      console.log('[TTS] ✓ 成功 ' + audio.length + ' bytes');
    } catch (err) {
      console.error('[TTS] ✗', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('合成失败: ' + err.message);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('使用 POST /tts 或 GET /voices');
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('========================================');
  console.log('  Edge TTS HTTP 代理已启动');
  console.log('  地址: http://127.0.0.1:' + PORT);
  console.log('  POST /tts  - 语音合成');
  console.log('  GET  /voices - 音色列表');
  console.log('========================================');
});
