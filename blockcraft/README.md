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
- [ ] 只读模式下无法预览图片的bug

## 待优化

- [X] 缩进： Tab键. 纯文本支持多行缩进
- [X] mermaid 图像预览
- [ ] adapter算法优化

## 未来计划

- [X] 恢复上次位置
- [ ] mermaid独立窗口可预览
- [ ] 点击附件直接唤起外部应用打开
- [X] 支持文章内段落跳转链接
- [X] pdf导出可配置及分页
- [X] 搜索和替换
- [ ] header列表和收起
- [ ] 主题切换
- [ ] 右键菜单
- [ ] 分屏

## TODO
- [ ] code高亮优化
- [X] code block 搜索时虚拟选区超出bug
- [ ] 拖拽可滚动
- [ ] 复制
- [X] shift跨表格行多选, 删除导致的数据出错
- [ ] 文本工具栏超出屏幕
- [ ] 导出PDF时携带标题

1. 支持外部存在合并单元格的表格粘贴，已测试平台：飞书、语雀
2. 修复某些情况下图片粘贴失效的问题
3. 修复某些情况下，外部文本粘贴时会丢失部分文本的情况
4. 修复部分样式问题
5. 修复粘贴时，代码块会出现多余空行的问题
6. 部分体验优化:
   1. 用户使用拖拽滚动条方式横向滚动时，提示快捷键
   2. tab缩进提示优化
   3. 在单元格或高亮块等特殊位置插入非法内容时的提示（比如在单元格中插入表格）
   4. 浮动小抓手前会显示当前内容块的类型图标
7. 修复双击全选某个段落后，会删除下面段落的bug
8. 优化书签网页内容爬取接口



