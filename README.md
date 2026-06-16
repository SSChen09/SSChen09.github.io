# 🌸 Su.LuoChen's Blog

> 期待未来，却又害怕遗忘过去

个人博客，基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 主题构建，托管于 [GitHub Pages](https://sschen09.github.io)。

---

## ✨ 特性

- 🎨 **Butterfly 主题** — 简洁美观的响应式设计
- 🔍 **站内搜索** — 基于 hexo-generator-search
- 💬 **评论系统** — Gitalk 评论集成
- 📝 **字数统计** — hexo-wordcount 插件
- 🏷️ **分类与标签** — 文章归档与分类管理

## 🛠️ 技术栈

| 技术 | 说明 |
|------|------|
| [Hexo](https://hexo.io/) | 静态博客框架 |
| [Butterfly](https://butterfly.js.org/) | Hexo 主题 |
| [GitHub Pages](https://pages.github.com/) | 静态网站托管 |
| [jsDelivr](https://www.jsdelivr.com/) | CDN 加速静态资源 |

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 14
- [Git](https://git-scm.com/)

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/SSChen09/SSChen09.github.io.git
cd SSChen09.github.io

# 安装依赖
npm install

# 本地预览
npm run server
```

访问 `http://localhost:4000` 即可预览博客。

### 常用命令

```bash
npm run server    # 启动本地服务器
npm run build     # 生成静态文件
npm run clean     # 清除缓存和生成的文件
npm run deploy    # 部署到 GitHub Pages
```

## 📁 项目结构

```
SSChen09.github.io/
├── _config.yml              # Hexo 主配置文件
├── _config.butterfly.yml    # Butterfly 主题配置
├── source/
│   └── _posts/              # 博客文章
├── themes/
│   └── butterfly/           # Butterfly 主题
├── scaffolds/               # 文章模板
└── package.json
```

## 🔧 自定义配置

博客的主要配置文件：

- **`_config.yml`** — Hexo 核心配置（站点信息、URL、插件等）
- **`_config.butterfly.yml`** — Butterfly 主题配置（导航、样式、社交链接等）

### 站点信息

```yaml
title: 洛辰の博客
subtitle: '苏苏苏洛辰qwq'
description: '期待未来，却又害怕遗忘过去'
author: Su.LuoChen
url: https://sschen09.github.io
```

## 📬 联系方式

- 🐙 GitHub: [SSChen09](https://github.com/SSChen09)
- 📧 Email: sansanchen09@gmail.com

## 📄 License

[MIT](LICENSE)

---

<p align="center">Made with ❤️ by <a href="https://github.com/SSChen09">Su.LuoChen</a></p>
