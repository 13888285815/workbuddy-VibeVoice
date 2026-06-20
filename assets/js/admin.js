const 菜单项 = document.querySelectorAll('.menu a');
const 保存按钮 = document.getElementById('保存配置');
const 重置按钮 = document.getElementById('重置配置');
const 接口地址 = document.getElementById('接口地址');
const 接口密钥 = document.getElementById('接口密钥');
const 模型路径 = document.getElementById('模型路径');
const 最大并发 = document.getElementById('最大并发');
const 任务列表 = document.getElementById('任务列表');
const 今日次数 = document.getElementById('今日次数');
const 排队任务 = document.getElementById('排队任务');
const 存储占用 = document.getElementById('存储占用');
const 浏览器信息 = document.getElementById('浏览器信息');
const 语音支持 = document.getElementById('语音支持');
const 提示 = document.getElementById('提示');

/* 切换左侧菜单高亮 */
菜单项.forEach(项 => {
  项.addEventListener('click', (事件) => {
    菜单项.forEach(i => i.classList.remove('active'));
    事件.target.classList.add('active');
  });
});

/* 显示临时提示 */
function 显示提示(文字) {
  提示.textContent = 文字;
  提示.classList.add('show');
  setTimeout(() => 提示.classList.remove('show'), 3000);
}

/* 从本地存储加载配置 */
function 加载配置() {
  const 配置 = JSON.parse(localStorage.getItem('模型配置') || '{}');
  接口地址.value = 配置.接口地址 || '';
  接口密钥.value = 配置.接口密钥 || '';
  模型路径.value = 配置.模型路径 || 'microsoft/VibeVoice-1.5B';
  最大并发.value = 配置.最大并发 || 4;
}

/* 保存配置到本地存储 */
保存按钮.addEventListener('click', () => {
  const 配置 = {
    接口地址: 接口地址.value,
    接口密钥: 接口密钥.value,
    模型路径: 模型路径.value,
    最大并发: 最大并发.value
  };
  localStorage.setItem('模型配置', JSON.stringify(配置));
  显示提示('配置已保存');
});

/* 恢复默认配置 */
重置按钮.addEventListener('click', () => {
  localStorage.removeItem('模型配置');
  加载配置();
  显示提示('配置已重置');
});

/* 渲染任务列表 */
function 渲染任务() {
  const 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  任务列表.innerHTML = '';
  if (列表.length === 0) {
    任务列表.innerHTML = '<tr><td colspan="4" style="color:var(--次要文字)">暂无任务</td></tr>';
    排队任务.textContent = '0';
    return;
  }
  列表.forEach(任务 => {
    const 行 = document.createElement('tr');
    行.innerHTML = `
      <td>${任务.时间}</td>
      <td>${任务.文本}</td>
      <td><span class="status-badge ${任务.状态 === '完成' ? 'status-success' : 'status-pending'}">${任务.状态}</span></td>
      <td><button class="btn-secondary" style="padding:6px 12px">删除</button></td>
    `;
    行.querySelector('button').addEventListener('click', () => {
      const 新列表 = 列表.filter(t => t.时间 !== 任务.时间);
      localStorage.setItem('语音任务', JSON.stringify(新列表));
      渲染任务();
    });
    任务列表.appendChild(行);
  });
  排队任务.textContent = 列表.filter(t => t.状态 === '排队').length;
}

/* 更新统计卡片 */
function 更新统计() {
  const 列表 = JSON.parse(localStorage.getItem('语音任务') || '[]');
  const 今天 = new Date().toLocaleDateString();
  今日次数.textContent = 列表.filter(t => t.时间.startsWith(今天)).length;
  const 占用 = JSON.stringify(localStorage).length / 1024 / 1024;
  存储占用.textContent = 占用.toFixed(2) + ' MB';
}

/* 展示浏览器与语音合成支持情况 */
function 检测环境() {
  浏览器信息.textContent = navigator.userAgent;
  语音支持.textContent = window.speechSynthesis ? '已支持' : '未支持';
}

加载配置();
渲染任务();
更新统计();
检测环境();
