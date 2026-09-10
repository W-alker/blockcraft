# 绝对对象范围与自由拖动

## 领域分工

- Placement 拥有原始坐标、对象包围盒及瞬态拖动范围；范围计算不约束坐标。
- Pagination 消费对象下沿补齐页面，不增加正文 slot。
- Virtualization 使用绝对对象可见范围索引；定位层保持零高度。
- Export 保留原始坐标、补齐尾页，纸张外部分沿用既有裁切规则。

## 不变量

1. 流式白底高度取正文自然高度与对象下沿加 padding 的较大值，不累加两者。
2. 保留 scrollContainer 内自由拖动；不限制到内容区，不吸附到纸张或页缝。
3. 位移和尺寸使用布局像素；视图缩放不改写坐标。
4. 查看、分页切换、远端更新和打印不搬移对象；松手写入一次事务，可撤销。
5. 对象删除或移动后范围可收缩；预览取消移除临时尾页。
6. 根级组合按整体包围盒计算范围，组内成员坐标不变。

## 性能与生命周期

内容更新先检查变化块的祖先路径，触及定位层才使范围失效。使用单个共享
ResizeObserver 测量已挂载根级对象，包含图片 Caption。普通的稳定滚动查询复用索引；
首次挂载、尺寸变化和结构变化可能引起索引重建。失效刷新按帧调度，读取 dirty 范围时也可同步刷新。
拖动使用已缓存的对象尺寸，所需页数变化时才请求分页；流式拖动使用缓存的 padding。
销毁时释放观察器、订阅和动画帧，恢复原 min-height。

## 验证资产

- page-surface.spec.ts：文档头、追加页列表和快照不变性。
- absolute-placement-visibility-index.spec.ts：自由坐标、测量刷新、删除后范围清理及稳定查询缓存。
- block-placement.manager.spec.ts：原有拖动、选区、组内定位与事务。
- print-paginator.spec.ts：对象尾页、自由坐标保留、源数据隔离。
- e2e/absolute-placement-bounds.spec.ts：流式伸缩、完整/稀疏分页、预览、撤销、取消、旋转、Caption、远端事务，以及 75%/150% 下在 scrollContainer 左右和顶部边缘自由拖放。

## 验证状态

2026-09-09 的 116 项单测和 7 项浏览器回归属于此前包含纸张约束的版本。
2026-09-10 按用户要求撤回该约束，修正版 production 构建、114 项定向单测及 10 项 Chrome 页面回归通过，运行时未捕获异常为零。
性能对比另行记录；Firefox / WebKit 未运行。
未修改包版本，未提交、发布，也未更新 cses-client 安装的 BlockCraft 包。

性能结果见 [三轮对比报告](absolute-placement-performance-2026-09-10.md)。

后续行内分页性能优化见 [优化前后三轮对比](pagination-performance-optimization-2026-09-10.md)。
