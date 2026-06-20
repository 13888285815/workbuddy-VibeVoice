const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 情绪 = document.getElementById('情绪');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前合成 = null;

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

/* 使用浏览器语音合成接口朗读文本 */
function 生成语音() {
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

  const  utter = new SpeechSynthesisUtterance(文本);
  const 音色 = 获取音色();
  if (音色) utter.voice = 音色;
  utter.rate = parseFloat(语速.value);
  utter.pitch = 情绪映射[情绪.value];

  当前合成 = utter;

  utter.onend = () => {
    显示提示('语音合成完成');
    当前合成 = null;
  };

  utter.onerror = (e) => {
    显示提示('语音合成失败：' + e.error);
    当前合成 = null;
  };

  window.speechSynthesis.speak(utter);
  显示提示('正在生成语音...');
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

/* 提示当前为演示版本，真实下载需接入后端模型 */
function 下载音频() {
  显示提示('当前为前端演示，下载功能需接入后端语音合成服务');
}

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);

/* 确保语音列表已加载 */
window.speechSynthesis.onvoiceschanged = () => {};
