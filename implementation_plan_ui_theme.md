# UI 主题设计与切换功能实施方案

## 背景

用户希望在现有的 Chrome 插件中保留并提供三套不同的 UI 视觉风格，让用户能够自主切换：
1. **Minimalist Light (极简浅色)**
2. **Glassmorphism Dark (现代毛玻璃深色)**
3. **Productivity Dark (开发者生产力深色)**

插件包含两处主要界面需要支持主题切换：
1. **Popup 面板** ([popup/popup.html](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/popup/popup.html))
2. **注入网页的悬浮面板** ([content/content.css](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/content/content.css), 由 [content/content.js](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/content/content.js) 渲染)

---

## 架构升级方案

由于需要支持多套主题，我们将采用 **CSS 变量 (Custom Properties)** 的架构，通过给 `html` (对于 Popup) 或 Shadow DOM 的容器组件 (对于 Content) 动态增加 `data-theme` 属性来切换主题。

### 1. 存储设计

主题偏好需要通过 `chrome.storage.local` 持久化保存，与 API Settings 类似。
- 新增存储键：`uiTheme` (默认值可设为 `glassmorphism-dark`)
- 在 [utils/storage.js](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/utils/storage.js) 中新增：
  - `saveTheme(themeName)`
  - `getTheme()`

### 2. 消息机制更新 ([background/background.js](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/background/background.js))

新增 Service Worker 消息中间件支持：
- `SAVE_THEME`: 保存主题并广播给所有活动标签页（使注入的面板实时刷新主题）。
- `GET_THEME`: 读取当前主题。

### 3. 主题系统抽象 ([styles/common.css](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/styles/common.css))

统一不同主题的骨架定义。利用属性选择器覆盖核心设计 Token：

```css
/* 默认 fallback */
:root, :host {
  --bg-color: #ffffff;
  --text-color: #333333;
  --panel-bg: rgba(255, 255, 255, 0.9);
  --accent-color: #007aff;
  /* ... */
}

/* Minimalist Light */
[data-theme="minimalist-light"] {
  --bg-color: #f5f5f7;
  --text-color: #1d1d1f;
  --panel-bg: #ffffff;
  --accent-color: #0066cc;
  --border-radius: 12px;
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  --border: 1px solid rgba(0, 0, 0, 0.05);
}

/* Glassmorphism Dark */
[data-theme="glassmorphism-dark"] {
  --bg-color: #0f172a;
  --text-color: #f8fafc;
  --panel-bg: rgba(15, 23, 42, 0.6);
  --backdrop-blur: blur(16px);
  --accent-color: #8b5cf6;
  --accent-gradient: linear-gradient(135deg, #8b5cf6, #06b6d4);
  --border-radius: 16px;
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  --border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Productivity Dark */
[data-theme="productivity-dark"] {
  --bg-color: #000000;
  --text-color: #ededed;
  --panel-bg: #111111;
  --accent-color: #0070f3;
  --border-radius: 6px;
  --shadow: 0 0 0 1px #333;
  --border: 1px solid #333;
  --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

---

## Proposed Changes

### [MODIFY] [utils/storage.js](file:///e:/简历网页插件/utils/storage.js)
- 增加 `getTheme` 和 `saveTheme` 函数。

### [MODIFY] [background/background.js](file:///e:/简历网页插件/background/background.js)
- 监听并处理 `GET_THEME` 和 `SAVE_THEME` 消息请求。
- (可选) 保存主题时触发 `BROADCAST_THEME_CHANGE` 发送给所有开启了 Content Script 的页面，以便实时切换。

### [MODIFY] [popup/popup.html](file:///e:/简历网页插件/popup/popup.html)
- 在右上角（或 Settings 区）新增一个 Theme 下拉选择框 `<select id="themeSelect">`。
- 将内联的 CSS 简化，引入一套基于变量的 `popup.css`。

### [MODIFY] [popup/popup.css](file:///e:/简历网页插件/popup/popup.css) (假设已抽取或在此提取)
- 剔除硬编码颜色，全部替换为 `var(--...[token])`。
- 新增悬浮互动效果动画。

### [MODIFY] [popup/popup.js](file:///e:/简历网页插件/popup/popup.js)
- 初始化时 [sendMessage({type: 'GET_THEME'})](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/popup/popup.js#37-48)，并给 `document.documentElement` 设置 `data-theme`。
- 监听 `#themeSelect` 的 change 事件，调用 `SAVE_THEME` 并在本地立即切换。

### [MODIFY] [styles/common.css](file:///e:/简历网页插件/styles/common.css)
- 定义三套主题所需的 CSS Custom Properties 集合 (`:root`, `[data-theme="..."]`)。

### [MODIFY] [content/content.css](file:///e:/简历网页插件/content/content.css)
- 剔除原有深色主题的硬编码色彩，接入 [styles/common.css](file:///e:/%E7%AE%80%E5%8E%86%E7%BD%91%E9%A1%B5%E6%8F%92%E4%BB%B6/styles/common.css) 中的变量。
- 对于 Shadow DOM，将样式绑定在 `[data-theme]` 上（或通过主容器应用 className）。

### [MODIFY] [content/content.js](file:///e:/简历网页插件/content/content.js)
- 面板渲染或初始化的时候获取当前主题 `GET_THEME`。
- 给面板的最外层包裹元素 (`<div id="ai-autofill-panel">`) 设置对应的 `data-theme="xxx"` 属性。
- 补充监听 `chrome.runtime.onMessage` 中的主题变更事件，实现页面无需刷新的无缝换肤。

---

## Verification Plan

### 自动化/静态检查
- `npx eslint` 检查新加入的 `storage` 方法。
- 通过 CSS linter 或者对比法检查 `content.css` 和 `popup.css` 是否漏掉了对 CSS Custom Properties 的改造。

### 可视化 & 手动测试
1. **安装最新插件版本**
2. **Popup 测试**：打开 Popup 面板，切换主题下拉框，检查所有界面的颜色、输入框、按钮是否有平滑过渡并达到设计要求，尤其是各主题核心特色（如方案 B 的毛玻璃，方案 C 的高密度与窄边框）。
3. **内容页面测试**：在任意目标网页打开 "Autofill Panel"，在 Popup 中切换主题，观察悬浮面板是否跟随更新渲染主题。
