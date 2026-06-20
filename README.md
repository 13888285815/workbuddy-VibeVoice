# 工蜂语音（WorkBuddy-VibeVoice）

一个基于网页的语音合成演示工作台，定位为 WorkBuddy 生态的语音能力入口。当前版本使用浏览器内置语音引擎实现实时试听，后续可接入后端模型服务。

## 功能特性

- 文本转语音在线演示
- 多说话人、情绪、语速调节
- 管理后台：模型配置、任务队列、运行统计
- 纯前端实现，可一键部署到 GitHub Pages

## 快速开始

1. 克隆仓库
   ```bash
   git clone https://github.com/13888285815/workbuddy-VibeVoice.git
   cd workbuddy-VibeVoice
   ```
2. 本地打开 `index.html` 或启动任意静态服务器：
   ```bash
   python3 -m http.server 8080
   ```
3. 浏览器访问 `http://localhost:8080`

## 部署说明

仓库已配置 GitHub Actions 工作流，推送到 `main` 分支后自动部署到 GitHub Pages。

## 访问地址

- 在线演示：https://13888285815.github.io/workbuddy-VibeVoice/
- 管理后台：https://13888285815.github.io/workbuddy-VibeVoice/admin.html
- 本地演示：http://localhost:8080
