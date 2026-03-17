# BlockCraft 虚拟渲染方案

## 一、背景与目标

当前 BlockCraft 采用全量渲染策略——文档中所有 Block 在初始化时全部创建 Angular 组件并挂载到 DOM。当文档包含数百甚至上千个 Block 时，会出现：

- 首屏渲染耗时过长（大量组件创建 + Change Detection）
- 滚动时内存占用持续增长
- 代码高亮、Mermaid 等重型块加剧性能问题

**目标：** 仅渲染视口内（+ 缓冲区）的 Block，视口外的 Block 用高度占位替代，实现 O(viewport) 级别的渲染开销。

---

## 二、vir 分支方案回顾与问题分析

vir 分支已实现了一套基础的虚拟渲染原型，核心思路：

### 2.1 已实现的部分

| 模块 | 实现内容 |
|------|---------|
| `VirtualRenderer` | 基于 scrollTop + heightMap 计算可见区间，throttle 16ms |
| `BlockModel` | 数据模型与组件解耦，组件销毁后模型仍存活 |
| `ChildrenContainerRef` | 替代 `BlockChildrenRenderRef`，支持 detach/insert |
| `DocVM` | 集成 VirtualRenderer，IntersectionObserver 追踪可见性 |
| Range Utils | `mergeRanges`、`diffRanges`、`applyOpToRanges` 区间算法 |
| Selection Pinning | 选区所在 Block 强制保持渲染 |

### 2.2 存在的问题

1. **仅支持 Root 一级虚拟渲染** — 嵌套结构（Table > Row > Cell、Callout > children）未做虚拟化
2. **高度估算不准确** — 默认高度（paragraph=24px, table=rows×45px）与实际差距大，导致滚动跳变
3. **Placeholder 实现粗糙** — 仅用单个 div 占位，多段不连续区间时有 bug
4. **组件 detach 后状态丢失** — EditableBlock 的 InlineManager DOM 被移除后，reattach 时需要完整 rerender
5. **ResizeObserver 与滚动位置竞争** — 高度变化时 scrollTop 补偿逻辑不完善，向上滚动时抖动
6. **Selection 跨虚拟边界** — 从已渲染区域拖选到未渲染区域时，选区计算异常
7. **CRUD 操作与虚拟渲染同步** — 批量插入/删除时 activeRange 更新可能不一致
8. **缺少渐进式加载** — 没有 idle-time 预渲染机制，快速滚动时白屏明显

---

## 三、改进方案设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      EditorComponent                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   ScrollContainer                      │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              VirtualRenderer                     │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │  │  │
│  │  │  │HeightMap  │ │RangeCalc │ │ ViewportTracker│  │  │  │
│  │  │  └──────────┘ └──────────┘ └────────────────┘  │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │  │  │
│  │  │  │Placeholder│ │BlockPool │ │ ScrollAnchor  │  │  │  │
│  │  │  │ Manager   │ │ Manager  │ │   Manager     │  │  │  │
│  │  │  └──────────┘ └──────────┘ └────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌─ Rendered Zone ──────────────────────────────────┐  │  │
│  │  │  [Placeholder top: 2400px]                       │  │  │
│  │  │  Block_15  Block_16  Block_17  ...  Block_35     │  │  │
│  │  │  [Placeholder bottom: 8600px]                    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 BlockModel 层（保留 vir 分支设计，增强）

vir 分支引入的 `BlockModel` 是正确的方向——将数据模型与 Angular 组件生命周期解耦。改进点：

```typescript
class BlockModel<M extends NativeBlockModel = NativeBlockModel> {
  // === vir 分支已有 ===
  parent: BlockModel | null
  native: M
  yBlock: YBlock<M>
  props / meta（proxy 代理）

  // === 新增 ===

  // 缓存的测量高度（来自 ResizeObserver 或估算）
  measuredHeight: number = -1

  // 是否已经被测量过真实高度
  isMeasured: boolean = false

  // 上次渲染时的 DOM 快照（用于快速恢复）
  // 仅对 EditableBlock 有效，缓存 containerElement.innerHTML
  cachedInlineHTML: string | null = null

  // 脏标记：model 在组件 detach 期间是否有数据变更
  dirtyWhileDetached: boolean = false
}
```

**关键改进：** 当 EditableBlock 被 detach 时，如果收到 Y.Text 变更事件，标记 `dirtyWhileDetached = true`。reattach 时根据此标记决定是否需要 rerender。

#### 3.2.2 HeightMap — 高度管理器

```typescript
class HeightMap {
  private _heights: Float64Array  // 紧凑存储，按 blockIdList 索引
  private _prefixSums: Float64Array  // 前缀和，O(1) 查询区间高度
  private _dirty = false  // 前缀和是否需要重算

  // 默认高度估算（改进版，基于 flavour + props）
  static estimateHeight(model: BlockModel): number {
    switch (model.flavour) {
      case 'paragraph':
        // 根据文本长度估算行数
        const charCount = model.textLength
        const avgCharsPerLine = 60
        const lineHeight = 24
        return Math.max(lineHeight, Math.ceil(charCount / avgCharsPerLine) * lineHeight)
      case 'code':
        // 根据代码行数估算
        const lines = model.textContent().split('\n').length
        return Math.max(48, lines * 20 + 48) // header + lines
      case 'table':
        return model.childrenLength * 40 + 40 // rows + header
      case 'mermaid':
        return 300
      case 'image':
        return model.props.height || 200
      case 'divider':
        return 32
      case 'callout':
        return 80
      default:
        return 32
    }
  }

  // O(1) 查询 [0, index) 的累计高度
  getOffset(index: number): number

  // O(1) 查询 [startIdx, endIdx] 的总高度
  getRangeHeight(startIdx: number, endIdx: number): number

  // O(log n) 二分查找：给定 scrollTop，找到对应的 block index
  findIndexByOffset(offset: number): number

  // 更新单个 block 高度，标记前缀和为 dirty
  update(index: number, height: number): void

  // 批量更新后重算前缀和
  recompute(): void

  get totalHeight(): number
}
```

**相比 vir 分支的改进：**
- 使用 `Float64Array` + 前缀和替代 `Map<string, number>`，查询从 O(n) 降到 O(1)
- 二分查找替代线性扫描定位 scrollTop 对应的 block
- 高度估算考虑文本长度、代码行数等实际内容

#### 3.2.3 VirtualRenderer — 核心渲染器（重构）

**核心问题：渲染集合不一定是连续的。**

除了视口区间外，还有多种原因导致某些 block 必须保持渲染（"钉住"）：
- 用户选区覆盖的 block
- iframe 嵌入块（`embed`、`figma-embed`、`juejin-embed`）— 从 DOM 移除会导致 iframe 重新加载、丢失状态
- 未来可能的其他场景（如正在播放的音视频块）

这些钉住的 block 可能分散在文档各处，不能简单用单连续区间覆盖（否则中间可能渲染数百个无关 block）。

**设计：视口区间 + 分散钉住集合 → 合并为有序区段列表**

```typescript
/** 一个连续的已渲染区段 */
type RenderedSegment = [startIdx: number, endIdx: number]  // 闭区间

class VirtualRenderer {
  readonly OVERSCAN = 5

  private heightMap: HeightMap
  private blockIds: string[] = []

  // ---- 渲染状态 ----

  // 当前视口对应的主区间
  private viewportRange: RenderedSegment = [-1, -1]

  // 钉住的 block 索引集合（来自选区、iframe 等多种来源）
  private pinnedIndices: SortedSet<number> = new SortedSet()

  // 最终合并后的有序区段列表（用于 DOM 渲染）
  private renderedSegments: RenderedSegment[] = []

  // ---- 钉住管理 ----

  /**
   * 钉住来源注册表
   * key = 来源标识（如 'selection', 'iframe:block_42'）
   * value = 该来源钉住的 block 索引集合
   *
   * 多来源独立管理，互不干扰。
   * 某个来源取消钉住时，只移除自己的部分。
   */
  private pinSources: Map<string, Set<number>> = new Map()

  /**
   * 注册钉住
   * @param source 来源标识
   * @param indices 需要钉住的 block 索引
   */
  pin(source: string, indices: number[]): void {
    // 移除该来源旧的钉住
    this.unpin(source)
    if (indices.length === 0) return
    this.pinSources.set(source, new Set(indices))
    indices.forEach(i => this.pinnedIndices.add(i))
    this.scheduleUpdate()
  }

  /**
   * 取消某个来源的钉住
   */
  unpin(source: string): void {
    const old = this.pinSources.get(source)
    if (!old) return
    this.pinSources.delete(source)
    // 重建 pinnedIndices（因为同一个 index 可能被多个 source 钉住）
    this.rebuildPinnedIndices()
    this.scheduleUpdate()
  }

  private rebuildPinnedIndices(): void {
    this.pinnedIndices.clear()
    for (const indices of this.pinSources.values()) {
      indices.forEach(i => this.pinnedIndices.add(i))
    }
  }

  // ---- 核心计算 ----

  /**
   * 计算视口主区间（二分查找，O(log n)）
   */
  private calcViewportRange(): RenderedSegment {
    const scrollTop = this.scrollContainer.scrollTop
    const viewportHeight = this.scrollContainer.clientHeight

    let startIdx = this.heightMap.findIndexByOffset(scrollTop)
    let endIdx = this.heightMap.findIndexByOffset(scrollTop + viewportHeight)

    startIdx = Math.max(0, startIdx - this.OVERSCAN)
    endIdx = Math.min(this.blockIds.length - 1, endIdx + this.OVERSCAN)

    return [startIdx, endIdx]
  }

  /**
   * 将视口区间 + 分散的钉住索引合并为有序区段列表
   *
   * 策略：相邻或重叠的索引合并为一个区段，
   * 间隔 > MERGE_GAP 的保持分离（中间用 spacer 占位）
   */
  private mergeToSegments(
    viewport: RenderedSegment,
    pinned: SortedSet<number>
  ): RenderedSegment[] {
    const MERGE_GAP = 2  // 间隔 ≤ 2 个 block 就合并，避免过多碎片

    // 收集所有需要渲染的索引（去重 + 排序）
    const allIndices = new SortedSet<number>()
    for (let i = viewport[0]; i <= viewport[1]; i++) {
      allIndices.add(i)
    }
    pinned.forEach(i => allIndices.add(i))

    if (allIndices.size === 0) return []

    // 合并为区段
    const sorted = allIndices.toArray()
    const segments: RenderedSegment[] = []
    let segStart = sorted[0]
    let segEnd = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - segEnd <= MERGE_GAP + 1) {
        // 间隔足够小，合并
        segEnd = sorted[i]
      } else {
        // 间隔太大，开新区段
        segments.push([segStart, segEnd])
        segStart = sorted[i]
        segEnd = sorted[i]
      }
    }
    segments.push([segStart, segEnd])

    return segments
  }

  /**
   * 差量更新视图
   * 对比 oldSegments vs newSegments，最小化 DOM 操作
   */
  private updateView(newSegments: RenderedSegment[]): void {
    const oldRendered = this.flattenSegments(this.renderedSegments)
    const newRendered = this.flattenSegments(newSegments)

    // 需要 detach 的：在 old 中但不在 new 中
    const toDetach = oldRendered.filter(i => !newRendered.has(i))
    // 需要 attach 的：在 new 中但不在 old 中
    const toAttach = [...newRendered].filter(i => !oldRendered.has(i))

    toDetach.forEach(i => this.detachBlock(this.blockIds[i]))
    toAttach.sort((a, b) => a - b).forEach(i => this.attachBlock(this.blockIds[i]))

    this.renderedSegments = newSegments
    this.updateSpacers(newSegments)
  }

  /**
   * 更新 spacer 元素
   * N 个区段需要 N+1 个 spacer（顶部、各区段间隙、底部）
   */
  private updateSpacers(segments: RenderedSegment[]): void {
    // spacer[0]: 第一个区段之前
    // spacer[i]: 第 i-1 个区段和第 i 个区段之间
    // spacer[N]: 最后一个区段之后
    this.ensureSpacerCount(segments.length + 1)

    this.spacers[0].style.height =
      `${this.heightMap.getOffset(segments[0][0])}px`

    for (let i = 1; i < segments.length; i++) {
      const gapStart = segments[i - 1][1] + 1
      const gapEnd = segments[i][0]
      this.spacers[i].style.height =
        `${this.heightMap.getRangeHeight(gapStart, gapEnd - 1)}px`
    }

    const lastSeg = segments[segments.length - 1]
    this.spacers[segments.length].style.height =
      `${this.heightMap.totalHeight - this.heightMap.getOffset(lastSeg[1] + 1)}px`
  }
}
```

**相比 vir 分支的改进：**
- **多来源钉住注册表** 替代单一 `pinnedRange`。选区、iframe、音视频等各自独立注册/注销，互不干扰
- **有序区段合并算法** 替代 vir 分支的 `activeRange: number[][]` 手动管理。自动将视口 + 分散钉住合并为最优区段列表，相邻的自动合并减少碎片
- **动态 spacer 池** 替代固定双占位。区段数量变化时自动增减 spacer 元素
- **二分查找** 替代线性扫描

#### 3.2.4 ScrollAnchor — 滚动锚点防抖

vir 分支中 ResizeObserver 更新高度后直接修改 `scrollTop`，容易造成抖动。改用锚点机制：

```typescript
class ScrollAnchorManager {
  private anchor: {
    blockId: string
    // 该 block 顶部相对于视口顶部的偏移
    relativeOffset: number
  } | null = null

  /**
   * 在可能导致高度变化的操作前，记录锚点
   * 锚点选择策略：视口中第一个完全可见的 block
   */
  save(): void {
    const scrollTop = this.scrollContainer.scrollTop
    const startIdx = this.heightMap.findIndexByOffset(scrollTop)
    const blockOffset = this.heightMap.getOffset(startIdx)
    this.anchor = {
      blockId: this.blockIds[startIdx],
      relativeOffset: blockOffset - scrollTop
    }
  }

  /**
   * 高度变化后，恢复锚点位置
   * 确保用户看到的内容不会跳变
   */
  restore(): void {
    if (!this.anchor) return
    const idx = this.blockIds.indexOf(this.anchor.blockId)
    if (idx === -1) return
    const newOffset = this.heightMap.getOffset(idx)
    this.scrollContainer.scrollTop = newOffset - this.anchor.relativeOffset
    this.anchor = null
  }
}
```

**工作流程：**
```
ResizeObserver 回调
  → scrollAnchor.save()
  → heightMap.update(blockIdx, newHeight)
  → heightMap.recompute()
  → updatePlaceholders()
  → scrollAnchor.restore()
```

#### 3.2.5 组件生命周期管理

保留 vir 分支的 `attach/detach` 设计，但增加状态恢复机制：

```
Block 生命周期状态机：

  ┌──────────┐    createComp     ┌──────────┐
  │ ModelOnly │ ───────────────→ │ Attached  │
  │ (无组件)  │                  │ (已挂载)  │
  └──────────┘                  └──────────┘
       ↑                          │       ↑
       │                   detach │       │ reattach
       │                          ↓       │
       │                        ┌──────────┐
       │    destroy             │ Detached  │
       │←───────────────────────│ (已卸载)  │
       │                        └──────────┘
```

**Detach 流程（Block 离开视口）：**
```typescript
detachBlock(blockId: string) {
  const ref = this.vm.getBlockRef(blockId)
  if (!ref) return

  const instance = ref.instance

  // iframe 块被钉住，不允许 detach（由 pin 机制保证，这里做防御性检查）
  if (instance.isPinned) return

  // 1. 对 EditableBlock，缓存当前 inline DOM
  if (instance instanceof EditableBlockComponent) {
    instance.model.cachedInlineHTML = instance.containerElement.innerHTML
  }

  // 2. 从 DOM 移除（不销毁组件）
  ref.location.nativeElement.remove()

  // 3. 分离变更检测
  ref.changeDetectorRef.detach()
}
```

**Reattach 流程（Block 进入视口）：**
```typescript
reattachBlock(blockId: string) {
  const ref = this.vm.getBlockRef(blockId)
  if (!ref) {
    // 首次渲染，创建组件
    return this.createAndInsertBlock(blockId)
  }

  const instance = ref.instance

  // 1. 重新挂载变更检测
  ref.changeDetectorRef.reattach()

  // 2. 插入 DOM
  this.insertAtCorrectPosition(ref)

  // 3. 恢复 EditableBlock 内容
  if (instance instanceof EditableBlockComponent) {
    if (instance.model.dirtyWhileDetached) {
      // 数据有变更，完整 rerender
      instance.rerender()
      instance.model.dirtyWhileDetached = false
    } else if (instance.model.cachedInlineHTML) {
      // 数据无变更，快速恢复 DOM
      instance.containerElement.innerHTML = instance.model.cachedInlineHTML
    }
    instance.model.cachedInlineHTML = null
  }

  // 4. 触发变更检测
  ref.changeDetectorRef.detectChanges()
}
```

#### 3.2.6 CRUD 与虚拟渲染的同步

vir 分支的 `applyOps` 直接操作 `activeRange`，逻辑复杂。改进方案：

```typescript
// DocVM.syncYEvent 中处理 children 变更
handleChildrenChange(parentId: string, delta: Y.YEvent['changes']['delta']) {
  if (parentId !== this.rootId) {
    // 非根级别，走普通 ChildrenContainerRef 逻辑（不变）
    return this.applyOpsToNested(parentId, delta)
  }

  // 根级别，更新 blockIds 和 heightMap
  let cursor = 0
  for (const op of delta) {
    if (op.retain) {
      cursor += op.retain
    } else if (op.insert) {
      const ids = op.insert as string[]
      // 1. 更新 blockIds
      this.blockIds.splice(cursor, 0, ...ids)
      // 2. 为新 block 创建 BlockModel
      ids.forEach(id => {
        const yBlock = this.crud.getYBlock(id)!
        this.vm.createBlockModel(yBlock, this.rootId)
      })
      // 3. 更新 heightMap（插入估算高度）
      this.heightMap.insertAt(cursor, ids.map(id =>
        HeightMap.estimateHeight(this.vm.getBlockModel(id))
      ))
      cursor += ids.length
    } else if (op.delete) {
      const deletedIds = this.blockIds.splice(cursor, op.delete)
      // 1. 如果在渲染区间内，从 DOM 移除
      // 2. 销毁组件和 model
      this.heightMap.removeAt(cursor, op.delete)
      this.vm.delete(deletedIds)
    }
  }

  // 重算前缀和 + 重新计算可见区间
  this.heightMap.recompute()
  this.virtualRenderer.scheduleUpdate()
}
```

---

### 3.3 DOM 结构设计

多区段渲染时，DOM 中会有多个 spacer 元素分隔各区段：

```html
<!-- ScrollContainer -->
<div class="scroll-container" style="overflow-y: auto;">

  <!-- spacer[0]: 第一个区段之前的空白 -->
  <div class="vr-spacer" style="height: 1200px;"></div>

  <!-- 区段 1: 视口区间 blocks 15-35 -->
  <root-block>
    <div class="block-children-container">
      <paragraph-block data-block-id="block_15">...</paragraph-block>
      ...
      <table-block data-block-id="block_35">...</table-block>
    </div>
  </root-block>

  <!-- spacer[1]: 区段 1 和区段 2 之间的空白 -->
  <div class="vr-spacer" style="height: 4800px;"></div>

  <!-- 区段 2: 钉住的 iframe 嵌入块 block_120 -->
  <embed-block data-block-id="block_120">
    <iframe src="..."></iframe>
  </embed-block>

  <!-- spacer[2]: 区段 2 和区段 3 之间的空白 -->
  <div class="vr-spacer" style="height: 2400px;"></div>

  <!-- 区段 3: 钉住的 figma 嵌入块 block_200 -->
  <figma-embed-block data-block-id="block_200">
    <iframe src="..."></iframe>
  </figma-embed-block>

  <!-- spacer[3]: 最后一个区段之后的空白 -->
  <div class="vr-spacer" style="height: 6000px;"></div>

</div>
```

**常见场景下的区段数量：**
- 无 iframe、无远距离选区 → 1 个区段 + 2 个 spacer（退化为最简形式）
- 有 1 个 iframe 在视口外 → 2 个区段 + 3 个 spacer
- 有 N 个分散的 iframe → 最多 N+1 个区段 + N+2 个 spacer

**Spacer 池管理：**
```typescript
private spacers: HTMLElement[] = []

ensureSpacerCount(count: number): void {
  while (this.spacers.length < count) {
    const spacer = document.createElement('div')
    spacer.className = 'vr-spacer'
    spacer.style.cssText = 'flex-shrink: 0; pointer-events: none;'
    this.spacers.push(spacer)
  }
  // 多余的 spacer 从 DOM 移除（保留在池中复用）
  // 不足的 spacer 插入到正确位置
  this.reconcileSpacerDOM()
}
```

**相比 vir 分支的改进：**
- vir 分支用 `root.hostElement.style.top` 做偏移 + 中间 placeholder div，结构复杂且多区段时有 bug
- 新方案用 spacer 池 + 区段交替排列，结构清晰，区段数量动态适应

---

### 3.4 钉住策略：谁需要钉住、何时钉住

#### 3.4.1 iframe 嵌入块 — 永久钉住

iframe 从 DOM 移除会导致页面重新加载、丢失滚动位置和用户交互状态。因此所有 iframe 类 block 在创建后必须永久钉住，直到被删除。

涉及的 block 类型：`embed`、`figma-embed`、`juejin-embed`

```typescript
// 在 BlockModel 创建时自动注册
onBlockModelCreated(model: BlockModel) {
  if (this.isIframeBlock(model.flavour)) {
    const idx = this.blockIds.indexOf(model.id)
    this.virtualRenderer.pin(`iframe:${model.id}`, [idx])
  }
}

// 在 block 被删除时自动注销
onBlockModelDeleted(model: BlockModel) {
  this.virtualRenderer.unpin(`iframe:${model.id}`)
}

private isIframeBlock(flavour: string): boolean {
  return ['embed', 'figma-embed', 'juejin-embed'].includes(flavour)
}
```

**优化：延迟首次渲染。** iframe 块虽然不能从 DOM 移除，但首次创建时如果不在视口内，可以延迟到用户滚动到附近时再创建组件。一旦创建，就永久钉住。

```typescript
// iframe 块的特殊处理：首次进入视口时创建并钉住
onBlockEnterViewport(blockId: string) {
  const model = this.vm.getBlockModel(blockId)
  if (this.isIframeBlock(model.flavour) && !this.vm.hasBlockRef(blockId)) {
    // 首次渲染 iframe 块，创建组件并永久钉住
    this.createAndInsertBlock(blockId)
    const idx = this.blockIds.indexOf(blockId)
    this.virtualRenderer.pin(`iframe:${blockId}`, [idx])
  }
}
```

#### 3.4.2 Selection — 动态钉住

选区变化时更新钉住范围，选区清除时取消钉住。

```typescript
onSelectionChange(selection: BlockSelection | null) {
  if (!selection) {
    this.virtualRenderer.unpin('selection')
    return
  }

  // 找到选区覆盖的所有根级 block 索引
  const rootStartIdx = this.findRootAncestorIndex(selection.firstBlock)
  const rootEndIdx = this.findRootAncestorIndex(selection.lastBlock)

  // 选区通常是连续的，生成连续索引数组
  const indices: number[] = []
  for (let i = rootStartIdx; i <= rootEndIdx; i++) {
    indices.push(i)
  }

  this.virtualRenderer.pin('selection', indices)
}
```

#### 3.4.3 其他可能的钉住场景

| 场景 | 来源标识 | 钉住时机 | 取消时机 |
|------|---------|---------|---------|
| 正在播放的音视频块 | `media:${blockId}` | 开始播放 | 播放结束/暂停 |
| 查找替换高亮 | `find-replace` | 搜索结果定位 | 关闭查找面板 |
| 拖拽排序中的源块 | `drag:${blockId}` | 拖拽开始 | 拖拽结束 |
| 协同编辑光标所在块 | `collab:${peerId}` | 远端光标移动 | 远端光标离开 |

### 3.5 Selection 跨虚拟边界处理

```typescript
// 当用户拖选超出已渲染区域时
handleSelectionExtend(direction: 'up' | 'down') {
  const viewport = this.virtualRenderer.viewportRange

  if (direction === 'down' && this.selectionEndIdx > viewport[1]) {
    // 向下扩展：临时扩大视口区间到选区末尾
    this.virtualRenderer.extendViewport(viewport[0], this.selectionEndIdx + 1)
  }

  if (direction === 'up' && this.selectionStartIdx < viewport[0]) {
    this.virtualRenderer.extendViewport(this.selectionStartIdx - 1, viewport[1])
  }
}
```
```

---

## 四、渲染流程详解

### 4.1 初始化流程

```
1. DocVM.init(yRoot)
   │
   ├─ 创建 RootBlock 组件（不渲染子块）
   │
   ├─ 遍历 yRoot.children，为每个 child：
   │   ├─ 创建 BlockModel（数据模型）
   │   └─ 计算估算高度 → HeightMap
   │
   ├─ HeightMap.recompute()（计算前缀和）
   │
   ├─ 创建 top/bottom sentinel 元素
   │
   ├─ 绑定 scroll 事件监听
   │
   └─ 首次 calcVisibleRange() → updateView()
       ├─ 为可见区间内的 block 创建组件
       ├─ 插入 DOM
       └─ 更新 sentinel 高度
```

### 4.2 滚动更新流程

```
scroll 事件
  │
  ├─ throttle 16ms（requestAnimationFrame）
  │
  ├─ calcViewportRange() → [newStart, newEnd]
  │
  ├─ mergeToSegments(viewportRange, pinnedIndices) → newSegments
  │
  ├─ 与 renderedSegments 比较
  │   ├─ 无变化 → 跳过
  │   └─ 有变化 → updateView(newSegments)
  │       ├─ diff oldSegments vs newSegments
  │       ├─ detach 不再需要的 block（跳过 pinned）
  │       ├─ attach 新进入的 block
  │       └─ updateSpacers(newSegments)
  │
  └─ 更新 renderedSegments
```

### 4.3 高度修正流程

```
ResizeObserver 回调（某个 block 实际高度变化）
  │
  ├─ scrollAnchor.save()
  │
  ├─ heightMap.update(blockIdx, newHeight)
  │
  ├─ heightMap.recompute()
  │
  ├─ updatePlaceholders()
  │
  ├─ scrollAnchor.restore()
  │
  └─ 如果 totalHeight 变化显著 → scheduleUpdate()
```

---

## 五、与现有系统的集成点

### 5.1 需要修改的文件

| 文件 | 修改内容 | 影响范围 |
|------|---------|---------|
| `framework/block-std/reactive/block.ts` | 新增 `BlockModel` 类（从 vir 分支移植 + 增强） | 核心 |
| `framework/doc/vm.ts` | 重构 `DocVM`，集成 VirtualRenderer | 核心 |
| `framework/doc/virtual-render.ts` | 新建，VirtualRenderer + HeightMap + ScrollAnchor | 核心 |
| `framework/doc/utils.ts` | 从 vir 分支移植区间算法工具 | 工具 |
| `framework/block-std/block/component/base-block.ts` | 适配 BlockModel，增加 attach/detach 生命周期 | 核心 |
| `framework/block-std/block/component/editable-block.ts` | 增加 cachedInlineHTML 恢复逻辑 | 核心 |
| `framework/doc/crud.ts` | syncYEvent 适配虚拟渲染 | 核心 |
| `framework/modules/selection/` | Selection 跨虚拟边界处理 | 中等 |
| `editor/editor.ts` | 提供 scrollContainer 引用 | 小 |
| 各 Block 组件 | 适配 BlockModel Input 变更 | 批量小改 |

### 5.2 不需要修改的部分

- **InlineManager** — 行内编辑系统不变，render/applyDeltaToView 逻辑保持
- **Plugin 系统** — 插件注册和事件分发机制不变
- **Adapter 系统** — 导入导出与虚拟渲染无关
- **UndoManager** — 撤销重做基于 Yjs，与渲染层解耦
- **UIEventDispatcher** — 事件分发不变，但需确保 detached block 不接收事件

### 5.3 对现有 Block 的影响

**无需改动的 Block：**
- 所有 EditableBlock（Paragraph, Code, Bullet, Ordered, Todo, BlockQuote, Caption）— 通过基类统一处理
- Void Block（Image, Divider, Bookmark, Attachment）— detach/reattach 无特殊逻辑

**需要适配的 Block：**

| Block | 适配内容 |
|-------|---------|
| EmbedBlock / FigmaEmbedBlock / JuejinEmbedBlock | iframe 块永久钉住策略，首次延迟渲染，不可 detach |
| MermaidBlock | 移除自有 IntersectionObserver，改用框架级 `onEnterViewport/onLeaveViewport` |
| CodeBlock | 代码高亮在 reattach 时需要重新触发（已有 debounce 机制可复用） |
| TableBlock | 嵌套子块（Row/Cell）不做虚拟化，但 detach 时需递归处理 |
| CalloutBlock | 同 TableBlock，嵌套子块递归 detach/reattach |
| ColumnsBlock | 同上 |

---

## 六、实施计划

### Phase 1：基础设施（预计 3-5 天）

1. 从 vir 分支移植 `BlockModel` 类，增加 `measuredHeight`、`cachedInlineHTML`、`dirtyWhileDetached` 字段
2. 实现 `HeightMap`（Float64Array + 前缀和 + 二分查找）
3. 实现 `ScrollAnchorManager`
4. 编写单元测试覆盖 HeightMap 和区间算法

### Phase 2：核心渲染器（预计 5-7 天）

1. 实现 `VirtualRenderer`（单连续区间版本）
2. 重构 `DocVM`，集成 VirtualRenderer
3. 重构 `BaseBlockComponent`，适配 BlockModel + attach/detach 生命周期
4. 重构 `EditableBlockComponent`，增加 DOM 缓存恢复
5. 实现 `ChildrenContainerRef`（从 vir 分支移植 + 简化）

### Phase 3：CRUD 同步（预计 3-4 天）

1. 重构 `DocCRUD.syncYEvent`，适配虚拟渲染
2. 处理根级别 insert/delete 与 HeightMap 的同步
3. 处理嵌套级别变更（非虚拟化，走 ChildrenContainerRef）
4. 测试协同编辑场景

### Phase 4：Selection 适配（预计 2-3 天）

1. Selection pinning 机制
2. 跨虚拟边界拖选
3. Ctrl+A 全选
4. 键盘导航（上下箭头跨越虚拟边界）

### Phase 5：Block 适配与优化（预计 3-4 天）

1. MermaidBlock 适配（移除自有 IntersectionObserver）
2. CodeBlock 高亮恢复
3. TableBlock / CalloutBlock 嵌套 detach 处理
4. 性能测试与调优（1000+ block 文档）

### Phase 6：边缘场景（预计 2-3 天）

1. 查找替换（FindReplacePlugin）跨虚拟边界
2. 拖拽排序跨虚拟边界
3. 剪贴板操作（大范围粘贴）
4. 演示模式（DemoPresentationPlugin）适配
5. 打印/导出时临时全量渲染

---

## 七、性能预期

| 指标 | 当前（全量渲染） | 虚拟渲染后 |
|------|----------------|-----------|
| 1000 block 首屏渲染 | ~2-4s | ~200-400ms |
| 内存占用（1000 block） | ~150-300MB | ~30-60MB |
| 滚动帧率 | 可能掉帧 | 稳定 60fps |
| 组件实例数 | = block 总数 | ≈ viewport block 数 + overscan |

---

## 八、风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 高度估算不准导致滚动条跳变 | ScrollAnchor 机制 + ResizeObserver 实时修正 |
| 快速滚动白屏 | 增大 OVERSCAN + requestIdleCallback 预渲染 |
| 协同编辑时远端插入导致视口偏移 | ScrollAnchor 在 syncYEvent 前后自动 save/restore |
| 嵌套 Block 内容过多 | Phase 1 不做嵌套虚拟化，后续按需扩展 |
| 现有插件依赖 DOM 查询 | 确保插件只查询已渲染 block 的 DOM，提供 `ensureRendered(blockId)` API |
| 大量 iframe 块导致钉住区段过多 | MERGE_GAP 自动合并相邻区段；iframe 首次延迟渲染减少初始开销 |
| iframe 块 spacer 高度不准导致位置偏移 | iframe 块创建后立即用 ResizeObserver 测量真实高度 |

---

## 九、API 设计总览

```typescript
// 对外暴露的核心 API
interface VirtualRendererAPI {
  // 确保某个 block 被渲染（用于程序化滚动、查找替换等）
  ensureRendered(blockId: string): Promise<void>

  // 滚动到指定 block
  scrollTo(blockId: string, behavior?: 'smooth' | 'instant'): void

  // 获取当前渲染区间
  getRenderedRange(): [number, number]

  // 临时禁用虚拟渲染（打印、导出场景）
  disableVirtualRendering(): void
  enableVirtualRendering(): void

  // 强制重算（窗口 resize 等）
  invalidate(): void
}
```
