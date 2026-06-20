const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前音频地址 = null;
let 当前音频块 = null;

/* 显示临时提示信息 */
function 显示提示(文字) {
  提示.textContent = 文字;
  提示.classList.add('show');
  setTimeout(() => 提示.classList.remove('show'), 3000);
}

/* 记录一次合成任务到本地存储 */
function 记录任务(文本, 状态) {
  const 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  列表.unshift({
    时间: new Date().toLocaleString(),
    文本: 文本.length > 30 ? 文本.slice(0, 30) + '...' : 文本,
    状态: 状态
  });
  localStorage.setItem('语音任务', JSON.stringify(列表.slice(0, 50)));
}

/* 将语速 0.5~2 映射到 Edge TTS 的百分比格式 */
function 速率转字符串(速度) {
  const 百分比 = Math.round((速度 - 1) * 100);
  return (百分比 >= 0 ? '+' : '') + 百分比 + '%';
}

/* 生成语音：调用微软 Edge 在线 TTS 服务，返回 MP3 */
async function 生成语音() {
  const 文本 = 输入文本.value.trim();
  if (!文本) {
    显示提示('请输入需要合成的文本');
    return;
  }

  生成按钮.disabled = true;
  生成按钮.textContent = '合成中...';
  显示提示('正在连接微软 Edge TTS 服务...');

  try {
    const 音色 = 说话人.value;
    const 速度 = parseFloat(语速.value);
    const 速率 = 速率转字符串(速度);

    /* 使用 edge-tts-universal 浏览器端库 */
    const 合成器 = new EdgeTTS(文本, 音色, {
      rate: 速率,
      volume: '+0%',
      pitch: '+0Hz'
    });

    const 结果 = await 合成器.synthesize();
    当前音频块 = 结果.audio;
    当前音频地址 = URL.createObjectURL(当前音频块);

    /* 显示播放器并播放 */
    音频播放器.src = 当前音频地址;
    音频播放器.style.display = 'block';
    音频播放器.play();

    显示提示('语音生成完成');
    记录任务(文本, '完成');
  } catch (错误) {
    显示提示('语音生成失败：' + 错误.message);
    记录任务(文本, '失败');
    console.error('Edge TTS 错误:', 错误);
  } finally {
    生成按钮.disabled = false;
    生成按钮.textContent = '生成语音';
  }
}

/* 下载已生成的音频文件 */
function 下载音频() {
  if (!当前音频块) {
    显示提示('请先生成语音');
    return;
  }
  const a = document.createElement('a');
  a.href = 当前音频地址;
  a.download = '语音合成_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.mp3';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  显示提示('音频文件已开始下载');
}

生成按钮.addEventListener('click', 生成语音);
下载按钮.addEventListener('click', 下载音频);
