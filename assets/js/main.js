const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前音频地址 = null;
let 当前音频块 = null;
let mediaRecorder = null;
let 录制音频块 = [];

/* ========================================
 *  Edge TTS Worker 代理配置
 *  部署 Cloudflare Worker 后填入 URL
 *  未配置时使用浏览器原生语音合成 + 录制方案
 * ======================================== */
var WORKER_URL = '';

function 显示提示(文字) {
  提示.textContent = 文字;
  提示.classList.add('show');
  setTimeout(function () { 提示.classList.remove('show'); }, 4000);
}

function 记录任务(文本, 状态) {
  var 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  列表.unshift({ 时间: new Date().toLocaleString(), 文本: 文本.length > 30 ? 文本.slice(0, 30) + '...' : 文本, 状态: 状态 });
  localStorage.setItem('语音任务', JSON.stringify(列表.slice(0, 50)));
}

function 速率转字符串(速度) {
  var 百分比 = Math.round((速度 - 1) * 100);
  return (百分比 >= 0 ? '+' : '') + 百分比 + '%';
}

/* ====== 方案 A: Worker 代理 Edge TTS ====== */
async function worker合成(文本, 音色, 速率) {
  var 响应 = await fetch(WORKER_URL + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 文本, voice: 音色, rate: 速率, volume: '+0%', pitch: '+0Hz' })
  });
  if (!响应.ok) throw new Error('Worker 返回错误 ' + 响应.status);
  return await 响应.blob();
}

/* ====== 方案 B: 浏览器原生 speechSynthesis ====== */
function 浏览器合成(文本, 音色, 速度) {
  return new Promise(function (resolve, reject) {
    var 合成器 = window.speechSynthesis;
    if (!合成器) { reject(new Error('当前浏览器不支持语音合成')); return; }

    var 音色映射 = {
      'zh-CN-XiaoxiaoNeural': 'zh-CN', 'zh-CN-YunxiNeural': 'zh-CN',
      'zh-CN-YunjianNeural': 'zh-CN', 'zh-CN-XiaoyiNeural': 'zh-CN',
      'zh-CN-XiaoxuanNeural': 'zh-CN', 'zh-CN-YunyangNeural': 'zh-CN',
      'zh-CN-YunxiaNeural': 'zh-CN', 'zh-TW-HsiaoChenNeural': 'zh-TW',
      'zh-TW-YunJheNeural': 'zh-TW', 'zh-HK-WanLungNeural': 'zh-HK',
      'zh-HK-HiuGaaiNeural': 'zh-HK', 'en-US-EmmaMultilingualNeural': 'en-US',
      'en-US-AndrewMultilingualNeural': 'en-US', 'ja-JP-NanamiNeural': 'ja-JP',
      'ko-KR-SunHiNeural': 'ko-KR'
    };
    var lang = 音色映射[音色] || 'zh-CN';

    var 语段 = new SpeechSynthesisUtterance(文本);
    语段.lang = lang;
    语段.rate = 速度;

    var 语音列表 = 合成器.getVoices();
    for (var i = 0; i < 语音列表.length; i++) {
      if (语音列表[i].lang.indexOf(lang) === 0) { 语段.voice = 语音列表[i]; break; }
    }

    语段.onend = function () { resolve(null); };
    语段.onerror = function (e) { reject(new Error('语音合成失败: ' + e.error)); };
    合成器.speak(语段);
  });
}

/* ====== 方案 C: 通过 getDisplayMedia 录制系统音频 ====== */
async function 录制并生成(文本, 音色, 速度) {
  /* 先播放语音 */
  await 浏览器合成(文本, 音色, 速度);

  /* 检查浏览器是否支持 getDisplayMedia 音频捕获 */
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('浏览器不支持屏幕共享录制。推荐使用 Chrome 浏览器，或配置 Worker URL 启用 MP3 下载。');
  }

  显示提示('请点击"开始共享"按钮，选择包含音频的标签页或窗口来录制语音...');

  try {
    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,  /* 必须要 video 才能拿到 audio */
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    /* 停止视频轨道，只保留音频 */
    stream.getVideoTracks().forEach(function (t) { t.stop(); });

    var audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      throw new Error('未捕获到音频轨道，请确保选择了包含音频的标签页');
    }

    var audioStream = new MediaStream(audioTracks);
    var mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }

    录制音频块 = [];
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: mimeType });

    mediaRecorder.ondataavailable = function (e) {
      if (e.data.size > 0) 录制音频块.push(e.data);
    };

    mediaRecorder.onstop = function () {
      var blob = new Blob(录制音频块, { type: mimeType });
      当前音频块 = blob;
      当前音频地址 = URL.createObjectURL(blob);

      音频播放器.src = 当前音频地址;
      音频播放器.style.display = 'block';
      显示提示('录制完成，可以下载了');
      记录任务(文本, '完成');
      下载按钮.textContent = '下载音频';

      stream.getTracks().forEach(function (t) { t.stop(); });
    };

    mediaRecorder.start();
    下载按钮.textContent = '⏹ 停止录制并下载';

    /* 自动停止按钮行为 */
    下载按钮.onclick = function () {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      恢复下载按钮();
    };

  } catch (e) {
    throw new Error('录制取消或失败：' + e.message);
  }
}

function 恢复下载按钮() {
  下载按钮.onclick = 下载音频;
  下载按钮.textContent = '下载音频';
}

/* ====== 主入口 ====== */
async function 生成语音() {
  var 文本 = 输入文本.value.trim();
  if (!文本) { 显示提示('请输入需要合成的文本'); return; }

  生成按钮.disabled = true;
  生成按钮.textContent = '合成中...';
  当前音频块 = null;
  当前音频地址 = null;

  try {
    var 音色 = 说话人.value;
    var 速度 = parseFloat(语速.value);
    var 速率 = 速率转字符串(速度);

    if (WORKER_URL) {
      显示提示('正在通过 Edge TTS 合成语音...');
      当前音频块 = await worker合成(文本, 音色, 速率);
      当前音频地址 = URL.createObjectURL(当前音频块);
      音频播放器.src = 当前音频地址;
      音频播放器.style.display = 'block';
      音频播放器.play();
      显示提示('语音生成完成（Edge TTS 高品质 MP3）');
      记录任务(文本, '完成');
    } else {
      显示提示('正在合成语音...');
      await 浏览器合成(文本, 音色, 速度);
      显示提示('语音已播放。如需下载，请点击下方「录制并下载」按钮');
      音频播放器.style.display = 'none';
      记录任务(文本, '完成');
    }
  } catch (错误) {
    显示提示('语音生成失败：' + 错误.message);
    记录任务(文本, '失败');
    console.error('TTS 错误:', 错误);
  } finally {
    生成按钮.disabled = false;
    生成按钮.textContent = '生成语音';
    恢复下载按钮();
  }
}

function 下载音频() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  if (!当前音频块) {
    显示提示('请先生成语音。如需下载功能，请配置 Cloudflare Worker URL');
    return;
  }

  var a = document.createElement('a');
  a.href = 当前音频地址;
  var ext = 当前音频块.type.indexOf('mpeg') !== -1 ? 'mp3' : 'webm';
  a.download = '意念语音_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  显示提示('音频文件已开始下载');
}

/* 预加载语音列表 */
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
  }
}

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);
