// Cloudflare Worker: Edge TTS 代理
// 部署步骤：
// 1. 打开 https://workers.cloudflare.com/
// 2. 创建新 Worker
// 3. 粘贴此代码
// 4. 部署
// 5. 拿到 Worker URL，填入 index.html 的 WORKER_URL 变量

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/tts') {
      return new Response('使用 POST /tts 请求', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const { text, voice, rate, volume, pitch } = await request.json();
      if (!text) return new Response('缺少 text', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });

      const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
      const CHROMIUM_VER = '143.0.3650.75';
      const WIN_EPOCH = 11644473600;

      // 生成 Sec-MS-GEC
      let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
      ticks -= ticks % 300;
      ticks *= 1e7;
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticks.toFixed(0) + TRUSTED_TOKEN));
      const secMsGec = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      // WebSocket URL
      const connId = crypto.randomUUID().replace(/-/g, '');
      const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-${CHROMIUM_VER}&ConnectionId=${connId}`;

      const audioChunks = [];
      let hasAudio = false;

      const result = await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('合成超时'));
        }, 15000);

        ws.addEventListener('open', () => {
          clearTimeout(timer);
          const dateStr = new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

          // 配置消息
          ws.send(`X-Timestamp:${dateStr}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
            `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);

          // 音色名解析
          const vn = voice || 'zh-CN-XiaoxiaoNeural';
          const parts = vn.split('-');
          let lang = parts.slice(0, 2).join('-');
          let name = parts.slice(2).join('-');
          const fullVoice = `Microsoft Server Speech Text to Speech Voice (${lang}, ${name})`;

          // SSML
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${fullVoice}'><prosody pitch='${pitch || '+0Hz'}' rate='${rate || '+0%'}' volume='${volume || '+0%'}'>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</prosody></voice></speak>`;

          ws.send(`X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${dateStr}Z\r\nPath:ssml\r\n\r\n${ssml}`);
        });

        ws.addEventListener('message', (event) => {
          const data = event.data;
          if (typeof data === 'string') {
            if (data.includes('Path:turn.end')) {
              setTimeout(() => {
                try { ws.close(); } catch (e) {}
              }, 500);
            }
          } else {
            const view = new DataView(data);
            if (data.byteLength > 2) {
              const hLen = view.getUint16(0);
              if (data.byteLength > hLen + 2) {
                const audio = data.slice(hLen + 2);
                if (audio.byteLength > 0) { audioChunks.push(audio); hasAudio = true; }
              }
            }
          }
        });

        ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket 连接失败')); });
        ws.addEventListener('close', () => {
          clearTimeout(timer);
          resolve(hasAudio ? new Blob(audioChunks, { type: 'audio/mpeg' }) : null);
        });
      });

      if (!result) {
        return new Response('合成失败', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      return new Response(result, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': `attachment; filename="tts_${Date.now()}.mp3"`,
        }
      });
    } catch (e) {
      return new Response(e.message, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
  }
};
