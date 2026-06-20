const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');
const 下载状态 = document.getElementById('下载状态');

let allVoices = [];
let voicesReady = false;
let 正在播放 = false;
let 当前说话人 = '';
let 当前文本 = '';

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

/* ====== 语音列表初始化（多次重试确保加载完整） ====== */
function 加载语音列表() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    allVoices = voices;
    voicesReady = true;
    console.log('语音列表已加载（' + voices.length + ' 个语音）');
  }
}

加载语音列表();
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = function () { 加载语音列表(); };
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

/* ====== BCP47 语言映射 ====== */
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

/* ====== 查找最匹配的语音 ====== */
function 查找语音(目标Lang) {
  if (allVoices.length === 0 && window.speechSynthesis) {
    allVoices = window.speechSynthesis.getVoices();
  }
  for (var i = 0; i < allVoices.length; i++) {
    if (allVoices[i].lang === 目标Lang) return allVoices[i];
  }
  for (var i = 0; i < allVoices.length; i++) {
    if (allVoices[i].lang.indexOf(目标Lang.split('-')[0]) === 0) return allVoices[i];
  }
  return allVoices.length > 0 ? allVoices[0] : null;
}

/* ====== 生成长文本分段处理（Chrome 15秒 bug） ====== */
function 分段文本(文本, 最大长度) {
  最大长度 = 最大长度 || 180;
  if (文本.length <= 最大长度) return [文本];

  var 段落 = [];
  var i = 0;
  while (i < 文本.length) {
    var end = i + 最大长度;
    if (end >= 文本.length) { 段落.push(文本.slice(i)); break; }

    /* 在标点处断开 */
    var 标点 = '，。！？；：、,.!?;:\n';
    var 断点 = -1;
    for (var j = end; j > i; j--) {
      if (标点.indexOf(文本[j]) !== -1) { 断点 = j + 1; break; }
    }
    if (断点 === -1) 断点 = end;
    段落.push(文本.slice(i, 断点));
    i = 断点;
  }
  return 段落;
}

/* ====== 浏览器原生 speechSynthesis 合成 ====== */
function 浏览器合成(文本, 音色, 速度) {
  return new Promise(function (resolve, reject) {
    var 合成器 = window.speechSynthesis;
    if (!合成器) { reject(new Error('当前浏览器不支持语音合成')); return; }

    合成器.cancel();
    var lang = 音色映射[音色] || 'zh-CN';
    var 段落 = 分段文本(文本);

    var 当前段 = 0;
    var resumeTimer = null;

    function 播放下一段() {
      if (当前段 >= 段落.length) {
        if (resumeTimer) clearInterval(resumeTimer);
        合成器.cancel();
        正在播放 = false;
        resolve();
        return;
      }

      var 语段 = new SpeechSynthesisUtterance(段落[当前段]);
      语段.lang = lang;
      语段.rate = 速度;

      var voice = 查找语音(lang);
      if (voice) 语段.voice = voice;

      /* Chrome 长文本自动暂停 bug 的修复 */
      resumeTimer = setInterval(function () {
        if (!合成器.speaking) { clearInterval(resumeTimer); return; }
        合成器.resume();
      }, 10000);

      语段.onend = function () {
        当前段++;
        播放下一段();
      };
      语段.onerror = function (e) {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          clearInterval(resumeTimer);
          正在播放 = false;
          resolve();
          return;
        }
        clearInterval(resumeTimer);
        正在播放 = false;
        reject(new Error('语音合成失败: ' + e.error));
      };

      合成器.speak(语段);
    }

    正在播放 = true;
    播放下一段();
  });
}

/* ====== 下载：录制系统音频 ====== */
async function 录制并下载() {
  if (!正在播放) {
    显示提示('请先生成并播放语音，然后在播放过程中点击下载');
    return;
  }

  下载按钮.disabled = true;
  下载按钮.textContent = '请选择屏幕...';

  try {
    /* 请求屏幕共享（需要选择"分享系统音频"选项） */
    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: true
    });

    /* 获取音频轨道 */
    var 音频轨道 = stream.getAudioTracks()[0];
    if (!音频轨道) {
      stream.getTracks().forEach(function(t) { t.stop(); });
      显示提示('未获取到音频轨道，请确保勾选了"分享系统音频"');
      下载按钮.disabled = false;
      下载按钮.textContent = '下载音频';
      return;
    }

    下载按钮.textContent = '录制中...';

    /* 使用 MediaRecorder 录制 */
    var recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    });

    var 音频块 = [];
    recorder.ondataavailable = function(e) { if (e.data.size > 0) 音频块.push(e.data); };

    recorder.onstop = function() {
      stream.getTracks().forEach(function(t) { t.stop(); });
      if (音频块.length === 0) {
        显示提示('录制失败：未捕获到音频');
        下载按钮.disabled = false;
        下载按钮.textContent = '下载音频';
        return;
      }
      var blob = new Blob(音频块, { type: 'audio/webm' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '意念语音_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      显示提示('音频已下载（WebM 格式）');
      下载按钮.disabled = false;
      下载按钮.textContent = '下载音频';
      记录任务(当前文本, '已下载');
    };

    recorder.start();

    /* 监听语音播放结束，自动停止录制 */
    var 检查间隔 = setInterval(function() {
      if (!window.speechSynthesis.speaking) {
        setTimeout(function() {
          if (recorder.state === 'recording') recorder.stop();
          clearInterval(检查间隔);
        }, 1000);
      }
    }, 500);

    /* 安全兜底：最多录 120 秒 */
    setTimeout(function() {
      if (recorder.state === 'recording') recorder.stop();
      clearInterval(检查间隔);
    }, 120000);

    显示提示('录制已开始，语音播放完毕后自动停止');

  } catch (错误) {
    console.error('录制错误:', 错误);
    显示提示('录制取消：' + (错误.message || '用户取消'));
    下载按钮.disabled = false;
    下载按钮.textContent = '下载音频';
  }
}

/* ====== 停止播放 ====== */
function 停止播放() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  正在播放 = false;
}

/* ====== 主入口 ====== */
async function 生成语音() {
  var 文本 = 输入文本.value.trim();
  if (!文本) { 显示提示('请输入需要合成的文本'); return; }

  生成按钮.disabled = true;
  生成按钮.textContent = '合成中...';

  try {
    var 音色 = 说话人.value;
    var 速度 = parseFloat(语速.value);
    当前说话人 = 音色;
    当前文本 = 文本;

    显示提示('正在合成语音...');
    await 浏览器合成(文本, 音色, 速度);
    显示提示('语音播放完成');
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

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 录制并下载);

/* 页面关闭时停止语音 */
window.addEventListener('beforeunload', 停止播放);
