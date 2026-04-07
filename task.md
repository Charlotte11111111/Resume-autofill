# 简历网申自动填写 Chrome 插件

## Phase 1: 规划与设计
- [x] 需求分析与技术选型
- [x] 撰写实施方案
- [ ] 用户确认方案

## Phase 2: 项目基础搭建
- [x] 初始化 Chrome 插件项目结构 (Manifest V3)
- [x] 搭建 Popup UI 界面
- [x] 实现 Service Worker 消息中心

## Phase 3: 简历上传与解析
- [x] 集成 PDF.js 解析 PDF 文件
- [x] 集成 mammoth.js 解析 Word 文件
- [x] 调用 AI API 将原始文本结构化为标准字段
- [x] 实现简历数据本地存储 (chrome.storage)

## Phase 4: 页面智能识别与填充
- [x] Content Script 注入与表单元素采集
- [x] AI 识别页面字段并匹配简历数据
- [x] 用户确认 UI 与自动填入逻辑
- [x] 多步表单缓存与增量填充

## Phase 5: 未知字段自学习
- [x] 监听用户手动输入内容
- [x] 识别新字段并提示用户存档
- [x] 更新本地简历存档

## Phase 6: 测试与打磨
- [/] 端到端测试
- [x] UI 打磨与动效
- [ ] 产出 Walkthrough
