const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 情绪 = document.getElementById('情绪');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前合成 = null;
let 录音缓冲区 = [];
let 录音器 = null;
let 最终下载链接 = null;

const 情绪映射 = {
  '平静': 1,
  '高兴': 1.2,
  '悲伤': 0.8,
  '愤怒': 0.9
};

/* 显示临时提示信息 */
function 显示提示(文字) {
  提示.textContent = 文字;
  提示.classList.add('show');
  setTimeout(() => 提示.classList.remove('show'), 3000);
}

/* 根据选项从浏览器语音列表中挑选最接近的音色 */
function 获取音色() {
  const 声音列表 = window.speechSynthesis.getVoices();
  const 中文声音 = 声音列表.filter(v => v.lang.startsWith('zh'));
  const 映射 = {
    '默认女声': 中文声音.find(v => v.name.includes('Female') || v.name.includes('女')),
    '温柔女声': 中文声音[1] || 中文声音[0],
    '沉稳男声': 中文声音.find(v => v.name.includes('Male') || v.name.includes('男')),
    '活力男声': 中文声音[2] || 中文声音[0]
  };
  return 映射[说话人.value] || 中文声音[0] || 声音列表[0];
}

/* 初始化录音：通过 AudioContext 捕获桌面音频流 */
async function 开始录音() {
  try {
    /* 请求用户授权捕获系统音频（需要 HTTPS 或 localhost） */
    const 系统流 = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    /* 用户可能只共享屏幕不共享音频，取音频轨道 */
    const 音频轨道 = 系统流.getAudioTracks();
    if (音频轨道.length === 0) {
      系统流.getTracks().forEach(t => t.stop());
      显示提示('未检测到音频轨道，请共享时勾选「共享标签页音频」');
      return false;
    }
    const 音频流 = new MediaStream(音频轨道);
    /* 停掉视频轨道，只需要音频 */
    系统流.getVideoTracks().forEach(t => t.stop());

    const 上下文 = new AudioContext({ sampleRate: 44100 });
    const 源 = 上下文.createMediaStreamSource(音频流);
    录音器 = new MediaRecorder(音频流, { mimeType: getSupportedMime() });
    录音缓冲区 = [];

    录音器.ondataavailable = (事件) => {
      if (事件.data.size > 0) 录音缓冲区.push(事件.data);
    };
    录音器.start(100);
    return true;
  } catch (错误) {
    显示提示('录音初始化失败：' + 错误.message);
    return false;
  }
}

function getSupportedMime() {
  const 类型列表 = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  for (const 类型 of 类型列表) {
    if (MediaRecorder.isTypeSupported(类型)) return 类型;
  }
  return '';
}

/* 停止录音并生成可播放/下载的音频 */
async function 停止录音() {
  return new Promise((完成) => {
    录音器.onstop = () => {
      const mime = getSupportedMime();
      const 后缀 = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'mp4';
      const 数据 = new Blob(录音缓冲区, { type: mime });
      const 地址 = URL.createObjectURL(数据);
      最终下载链接 = { 地址, 后缀, 数据 };
      音频播放器.classList.remove('hidden');
      音频播放器.src = 地址;
      完成();
    };
    录音器.stop();
  });
}

/* 使用浏览器语音合成接口朗读文本，同时录制音频 */
async function 生成语音() {
  const 文本 = 输入文本.value.trim();
  if (!文本) {
    显示提示('请输入需要合成的文本');
    return;
  }
  if (!window.speechSynthesis) {
    显示提示('当前浏览器不支持语音合成功能');
    return;
  }

  if (当前合成) {
    window.speechSynthesis.cancel();
  }

  /* 先启动录音 */
  显示提示('请选择共享当前标签页并勾选「分享标签页音频」，然后点击分享');
  const 录音就绪 = await 开始录音();
  if (!录音就绪) return;

  /* 等一小段时间确保录音已就绪 */
  await new Promise(r => setTimeout(r, 500));

  /* 开始语音合成 */
  const utter = new SpeechSynthesisUtterance(文本);
  const 音色 = 获取音色();
  if (音色) utter.voice = 音色;
  utter.rate = parseFloat(语速.value);
  utter.pitch = 情绪映射[情绪.value];

  当前合成 = utter;
  显示提示('正在生成语音并录制中...');

  utter.onend = async () => {
    /* 朗读结束后等一小段再停止录音，避免截断尾部 */
    await new Promise(r => setTimeout(r, 600));
    await 停止录音();
    显示提示('语音生成完成，可播放或下载');
    当前合成 = null;
  };

  utter.onerror = (e) => {
    显示提示('语音合成失败：' + e.error);
    当前合成 = null;
  };

  window.speechSynthesis.speak(utter);
  记录任务(文本, '完成');
}

/* 记录一次合成任务到本地存储，供管理后台查看 */
function 记录任务(文本, 状态) {
  const 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  列表.unshift({
    时间: new Date().toLocaleString(),
    文本: 文本.length > 30 ? 文本.slice(0, 30) + '...' : 文本,
    状态: 状态
  });
  localStorage.setItem('语音任务', JSON.stringify(列表.slice(0, 50)));
}

/* 下载已录制的音频文件 */
function 下载音频() {
  if (!最终下载链接) {
    显示提示('请先生成语音，生成完成后才能下载');
    return;
  }
  const a = document.createElement('a');
  a.href = 最终下载链接.地址;
  a.download = '语音合成_' + Date.now() + '.' + 最终下载链接.后缀;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  显示提示('音频文件已开始下载');
}

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);

/* 确保语音列表已加载 */
window.speechSynthesis.onvoiceschanged = () => {};

