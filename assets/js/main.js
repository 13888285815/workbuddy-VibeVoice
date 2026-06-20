const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前音频地址 = null;
let 当前音频块 = null;
let allVoices = [];
let voicesReady = false;

/* ========================================
 *  Edge TTS Worker 代理配置
 *  部署 Cloudflare Worker 后填入 URL
 *  未配置时使用浏览器原生语音合成
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

/* ====== 语音列表初始化（多次重试确保加载完整） ====== */
function 加载语音列表() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    allVoices = voices;
    voicesReady = true;
    console.log('语音列表已加载（' + voices.length + ' 个语音）：');
    voices.forEach(function (v) { console.log('  ' + v.lang + ' | ' + v.name); });
  }
}

/* 立即尝试加载 + 事件回调 + 重试兜底 */
加载语音列表();
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = function () {
    加载语音列表();
  };
  /* 有些浏览器延迟加载，最多重试 5 次 */
  var retryCount = 0;
  var retryTimer = setInterval(function () {
    retryCount++;
    if (allVoices.length > 0 || retryCount > 5) {
      clearInterval(retryTimer);
      if (allVoices.length === 0 && window.speechSynthesis) {
        allVoices = window.speechSynthesis.getVoices();
        if (allVoices.length > 0) voicesReady = true;
      }
    } else {
      加载语音列表();
    }
  }, 500);
}

/* ====== 查找最匹配的语音 ====== */
function 查找语音(目标Lang) {
  if (allVoices.length === 0) {
    /* 强制刷新一次 */
    if (window.speechSynthesis) {
      allVoices = window.speechSynthesis.getVoices();
    }
  }

  /* 精确匹配 */
  for (var i = 0; i < allVoices.length; i++) {
    if (allVoices[i].lang === 目标Lang) return allVoices[i];
  }
  /* 前缀匹配 */
  for (var i = 0; i < allVoices.length; i++) {
    if (allVoices[i].lang.indexOf(目标Lang.split('-')[0]) === 0) return allVoices[i];
  }
  /* 最终兜底：返回第一个语音（至少有声音） */
  if (allVoices.length > 0) return allVoices[0];
  return null;
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

    /* BCP47 语言映射 */
    var 音色映射 = {
      'zh-CN-XiaoxiaoNeural': 'zh-CN',
      'zh-CN-YunxiNeural': 'zh-CN',
      'zh-CN-YunjianNeural': 'zh-CN',
      'zh-CN-XiaoyiNeural': 'zh-CN',
      'zh-CN-XiaoxuanNeural': 'zh-CN',
      'zh-CN-YunyangNeural': 'zh-CN',
      'zh-CN-YunxiaNeural': 'zh-CN',
      'zh-TW-HsiaoChenNeural': 'zh-TW',
      'zh-TW-YunJheNeural': 'zh-TW',
      'zh-HK-WanLungNeural': 'zh-HK',
      'zh-HK-HiuGaaiNeural': 'zh-HK',
      'en-US-EmmaMultilingualNeural': 'en-US',
      'en-US-AndrewMultilingualNeural': 'en-US',
      'ja-JP-NanamiNeural': 'ja-JP',
      'ko-KR-SunHiNeural': 'ko-KR'
    };
    var lang = 音色映射[音色] || 'zh-CN';

    /* 先取消之前可能卡住的语音 */
    合成器.cancel();

    var 语段 = new SpeechSynthesisUtterance(文本);
    语段.lang = lang;
    语段.rate = 速度;

    var voice = 查找语音(lang);
    if (voice) {
      语段.voice = voice;
      console.log('使用语音: ' + voice.name + ' (' + voice.lang + ')');
    } else {
      console.warn('未找到匹配语音，使用默认（lang=' + lang + '）');
    }

    /* Chrome 长文本 bug：超过约 15 秒会自动停止，需要定时 resume */
    var resumeTimer = setInterval(function () {
      if (!合成器.speaking) { clearInterval(resumeTimer); return; }
      合成器.resume();
    }, 10000);

    语段.onend = function () {
      clearInterval(resumeTimer);
      resolve(null);
    };
    语段.onerror = function (e) {
      clearInterval(resumeTimer);
      reject(new Error('语音合成失败: ' + e.error));
    };

    /* 延迟 100ms 再 speak，确保语音列表已加载 */
    setTimeout(function () {
      var voice2 = 查找语音(lang);
      if (voice2) 语段.voice = voice2;
      合成器.speak(语段);
    }, 100);
  });
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
    } else {
      显示提示('正在合成语音...');
      await 浏览器合成(文本, 音色, 速度);
      显示提示('语音播放完成');
      音频播放器.style.display = 'none';
    }
    记录任务(文本, '完成');
  } catch (错误) {
    显示提示('语音生成失败：' + 错误.message);
    记录任务(文本, '失败');
    console.error('TTS 错误:', 错误);
  } finally {
    生成按钮.disabled = false;
    生成按钮.textContent = '生成语音';
  }
}

function 下载音频() {
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

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);
