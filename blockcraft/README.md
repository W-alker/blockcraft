# BlockCraft

## 待优化

- [ ] doc 的生命周期

---

- [ ] `剪切版数据适配`
  - [X] 剪切板
  - [X] delta to html
  - [X] html to delta
  - [X] html to block snapshot
  - [X] block snapshot to html
  - [ ] markdown to snapshot

> 使用 blocksuite 的adapter机制，ASTWalker等。

---

- [X] mention plugin !!!!!!!!!

- [ ] code block 优化
  - [ ] 优化代码高亮性能
  - [ ] 使用shiki及懒请求
  - [ ] 优化代码块编辑体验

- [X] mermaid block 迁移及优化

--- 

- [ ] 导出
  - [X] to PDF
  - [ ] to html
  - [ ] to markdown
  - [X] to png
  - [X] to snapshot

> 参考 blocksuite 的导出

- [ ] 多人协同
  - [ ] 自由灵活的数据协同和合并机制
  - [ ] FakeRange渲染优化
  - [ ] 基于数据驱动的实时多端选择渲染同步

--- 

## bug

- [X] 协同时可能导致的视图错乱问题
- [X] mermaid textarea 双击选中
- [ ] 粘贴时先删除
- [ ] 拖拽block时无法滚动
- [ ] 多人协同虚拟光标会卡住以及第一次进入时无光标
- [ ] order算法(再结合heading属性)

## 待优化

- [X] 缩进： Tab键. 纯文本支持多行缩进
- [X] mermaid 图像预览
- [ ] adapter算法优化

## 未来计划

- [X] 恢复上次位置
- [ ] mermaid独立窗口可预览
- [ ] 点击附件直接唤起外部应用打开
- [ ] 支持文章内段落跳转链接
- [ ] pdf导出可配置及分页
- [ ] 搜索和替换
- [ ] header列表和收起
- [ ] 主题切换
- [ ] 右键菜单
- [ ] 分屏


1. 修复一些样式上的问题，优化了部分block的样式
2. 修复了 / 热键打开的快捷下文框，鼠标悬停和键盘选择的冲突问题
3. 修复和优化了粘贴行为
4. 优化了一些细节：浮动工具栏的下拉移入等

  
