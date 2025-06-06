# BlockCraft

## 已优化
1. 多行选择模型
2. 链接、书签、嵌入视图
3. 拖拽
4. 复制粘贴
5. mermaid优化
6. 附件
7. 表格


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
- [ ] mention plugin !!!!!!!!!

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
- [ ] mermaid textarea 双击选中
- [ ] 拖拽block时无法滚动
- [ ] 多人协同虚拟光标会卡住以及第一次进入时无光标
- [ ] order算法(再结合heading属性)

## 待优化
- [ ] 缩进： Tab键
- [ ] mermaid 图像预览
- [ ] new Image() 优化图片加载

## 未来计划
- [ ] 恢复上次位置
- [ ] 搜索和替换
- [ ] header列表和收起
- [ ] 主题切换
- [ ] 右键菜单
- [ ] 分屏

  
