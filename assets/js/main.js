const 输入文本 = document.getElementById('输入文本');
const 说话人 = document.getElementById('说话人');
const 语速 = document.getElementById('语速');
const 生成按钮 = document.getElementById('生成按钮');
const 下载按钮 = document.getElementById('下载按钮');
const 音频播放器 = document.getElementById('音频播放器');
const 提示 = document.getElementById('提示');

let 当前音频地址 = null;

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

/* 生成语音：调用 Google Translate TTS 接口，返回可直接播放的 MP3 */
async function 生成语音() {
  const 文本 = 输入文本.value.trim();
  if (!文本) {
    显示提示('请输入需要合成的文本');
    return;
  }

  生成按钮.disabled = true;
  生成按钮.textContent = '合成中...';
  显示提示('正在生成语音...');

  try {
    const 语言 = 说话人.value;
    const 速度 = parseFloat(语速.value);
    /* 将语速 0.5~2 映射到 Google TTS 的 0.1~10 范围 */
    const 谷歌语速 = Math.max(0.1, Math.min(10, 速度 * 5));

    /* Google Translate TTS 接口，直接返回 MP3 音频流 */
    const 接口地址 = 'https://translate.google.com/translate_tts';
    const 参数 = new URLSearchParams({
      ie: 'UTF-8',
      q: 文本,
      tl: 语言,
      client: 'tw-ob',
      ttsspeed: 谷歌语速.toFixed(1)
    });

    /* 通过 CORS 代理获取音频数据，避免跨域限制 */
    const 代理地址 = 'https://corsproxy.io/?' + encodeURIComponent(接口地址 + '?' + 参数);
    const 响应 = await fetch(代理地址);

    if (!响应.ok) {
      throw new Error('接口返回状态码 ' + 响应.status);
    }

    const 数据块 = await 响应.blob();
    当前音频地址 = URL.createObjectURL(数据块);

    /* 显示播放器并播放 */
    音频播放器.src = 当前音频地址;
    音频播放器.style.display = 'block';
    音频播放器.play();

    显示提示('语音生成完成');
    记录任务(文本, '完成');
  } catch (错误) {
    显示提示('语音生成失败：' + 错误.message);
    记录任务(文本, '失败');
  } finally {
    生成按钮.disabled = false;
    生成按钮.textContent = '生成语音';
  }
}

/* 下载已生成的音频文件 */
function 下载音频() {
  if (!当前音频地址) {
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
