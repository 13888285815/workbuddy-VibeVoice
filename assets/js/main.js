const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前音频地址 = null;
let 当前音频块 = null;

/* ========================================
 *  Edge TTS Worker 代理配置
 *  将你的 Cloudflare Worker URL 填入下方
 *  如果未配置，会自动 fallback 到浏览器原生 speechSynthesis
 * ======================================== */
var WORKER_URL = '';

/* 显示临时提示信息 */
function 显示提示(文字) {
  提示.textContent = 文字;
  提示.classList.add('show');
  setTimeout(function () { 提示.classList.remove('show'); }, 3000);
}

/* 记录任务 */
function 记录任务(文本, 状态) {
  var 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  列表.unshift({
    时间: new Date().toLocaleString(),
    文本: 文本.length > 30 ? 文本.slice(0, 30) + '...' : 文本,
    状态: 状态
  });
  localStorage.setItem('语音任务', JSON.stringify(列表.slice(0, 50)));
}

/* 语速映射 */
function 速率转字符串(速度) {
  var 百分比 = Math.round((速度 - 1) * 100);
  return (百分比 >= 0 ? '+' : '') + 百分比 + '%';
}

/* ====== 方案 A: 通过 Worker 调用 Edge TTS ====== */
async function worker合成(文本, 音色, 速率) {
  var 响应 = await fetch(WORKER_URL + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 文本,
      voice: 音色,
      rate: 速率,
      volume: '+0%',
      pitch: '+0Hz'
    })
  });
  if (!响应.ok) throw new Error('Worker 返回错误 ' + 响应.status);
  return await 响应.blob();
}

/* ====== 方案 B: 浏览器原生 speechSynthesis ====== */
function 浏览器合成(文本, 音色) {
  return new Promise(function (resolve, reject) {
    var 合成器 = window.speechSynthesis;
    if (!合成器) { reject(new Error('当前浏览器不支持语音合成')); return; }

    /* 音色名映射：Edge TTS 短名 → 浏览器 BCP47 标签 */
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

    var 语段 = new SpeechSynthesisUtterance(文本);
    语段.lang = lang;
    语段.rate = parseFloat(语速.value);

    /* 尝试找对应语言的语音 */
    var 语音列表 = 合成器.getVoices();
    for (var i = 0; i < 语音列表.length; i++) {
      if (语音列表[i].lang.indexOf(lang) === 0) {
        语段.voice = 语音列表[i];
        break;
      }
    }

    语段.onend = function () { resolve(null); };
    语段.onerror = function (e) { reject(new Error('语音合成失败: ' + e.error)); };

    合成器.speak(语段);
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
      /* 方案 A: Worker 代理 */
      显示提示('正在通过 Edge TTS 合成语音...');
      当前音频块 = await worker合成(文本, 音色, 速率);
      当前音频地址 = URL.createObjectURL(当前音频块);

      音频播放器.src = 当前音频地址;
      音频播放器.style.display = 'block';
      音频播放器.play();

      显示提示('语音生成完成（Edge TTS）');
    } else {
      /* 方案 B: 浏览器原生 */
      显示提示('正在使用浏览器语音合成...');
      await 浏览器合成(文本, 音色);

      显示提示('语音播放完成（浏览器原生，暂不支持下载）');
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

/* 下载 */
function 下载音频() {
  if (!当前音频块) {
    显示提示(WORKER_URL ? '请先生成语音' : '浏览器原生模式暂不支持下载，请配置 Worker URL');
    return;
  }
  var a = document.createElement('a');
  a.href = 当前音频地址;
  a.download = '语音合成_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.mp3';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  显示提示('音频文件已开始下载');
}

/* 预加载语音列表 */
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = function () {
      window.speechSynthesis.getVoices();
    };
  }
}

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);
