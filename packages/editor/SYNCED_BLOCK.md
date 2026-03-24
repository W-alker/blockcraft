# 同步块（Synced Block）设计文档

## 一、概述

同步块允许同一份内容在多个位置被引用，编辑任何一处引用时所有引用实时同步更新。支持跨文档引用——同一个同步块源可以出现在不同页面的文档中。

### 核心约束

1. **跨文档共享**：同步块源是独立的 `Y.Doc`，多个页面文档可以引用同一个源
2. **统一 Undo**：每个页面的 undo 时间线包含该页面上下文中的所有编辑（含同步块编辑）
3. **数据共享，DOM 独立**：所有引用共享同一份 Yjs 数据，但各自拥有独立的渲染实例和选区

---

## 二、数据模型

### 2.1 整体结构

```
Page-A.ydoc (页面文档)              Shared (同步块源)
┌───────────────────────┐          ┌─────────────────────┐
│ yBlockMap (Y.Map)     │          │ src-1.ydoc           │
│  ├── block-A: paragraph│          │  ├── blockMap (Y.Map)│
│  ├── block-B: synced-ref ──ref──▶│  │    ├── inner-1    │
│  └── block-C: heading  │          │  │    └── inner-2    │
│                         │          │  └── children (Y.Array)
│ syncedRefs (Y.Map)     │          │       ['inner-1',   │
│  └── block-B → src-1   │          │        'inner-2']   │
└───────────────────────┘          └─────────────────────┘

Page-B.ydoc (另一个页面)
┌───────────────────────┐
│ yBlockMap (Y.Map)     │
│  ├── block-X: paragraph│
│  └── block-Y: synced-ref ──ref──▶ (同一个 src-1.ydoc)
│                         │
│ syncedRefs (Y.Map)     │
│  └── block-Y → src-1   │
└───────────────────────┘
```

### 2.2 页面文档结构

页面 `Y.Doc` 中新增：

```typescript
// 现有
const yBlockMap = doc.getMap<YBlock>('blocks')    // block 数据

// 新增
const syncedRefs = doc.getMap<string>('syncedRefs')  // blockId → sourceId 映射
```

`synced-ref` 类型的 block 在 `yBlockMap` 中只存结构信息（id、flavour、parent），不存内容。内容在子文档中。

### 2.3 同步块源（Sub-document）

每个同步块源是一个独立的 `Y.Doc`：

```typescript
interface SyncedSourceDoc {
  // Y.Doc 实例，作为 sub-document 挂载或独立加载
  readonly ydoc: Y.Doc

  // 内部 block 数据
  readonly blockMap: Y.Map<YBlock>       // inner block 数据

  // block 顺序
  readonly children: Y.Array<string>     // inner block ID 列表
}
```

### 2.4 Block Snapshot 扩展

```typescript
// 新增 block flavour
interface ISyncedRefBlockSnapshot extends IBlockSnapshot {
  flavour: 'synced-ref'
  nodeType: BlockNodeType.block    // 容器类型，内部渲染子文档内容
  props: {
    sourceId: string               // 指向同步块源
  }
}
```

---

## 三、Undo 方案

### 3.1 技术选型：`YMultiDocUndoManager`

来自 `y-utility` 包（Yjs 官方生态），支持跨 `Y.Doc` 的统一 undo 栈。

```
npm: y-utility
import: import { YMultiDocUndoManager } from 'y-utility/y-multidoc-undomanager'
```

**原理**：内部维护 `Map<Y.Doc, Y.UndoManager>`，每个文档一个真实的 `Y.UndoManager`，外层用统一栈协调 undo/redo 顺序。API 兼容 `Y.UndoManager`。

### 3.2 已知 Bug 及对策

#### Bug 1：`stackItem.meta` 在 undo↔redo 转移时丢失

**来源**：[yjs#611](https://github.com/yjs/yjs/issues/611)

**对策**：不使用 `stackItem.meta`。现有 `DocUndoManger` 已经用并行栈（`_undoSelectionStack` / `_redoSelectionStack`）存储选区快照，保持此模式不变。

#### Bug 2：嵌套 Y.Map + Y.Array 组合 undo 导致远端状态不一致

**来源**：[yjs#642](https://github.com/yjs/yjs/issues/642)

**对策**：用 `stopCapturing()` 将结构操作和内容操作拆分为独立的 undo item。详见 §5.2。

#### Bug 3：跨文档无事务原子性

**来源**：Yjs 事务只在单个 `Y.Doc` 内原子

**对策**：接受。同步块的跨文档操作只有两类：
- 内容编辑：只改 synced doc，单文档事务，天然原子
- 创建/删除：拆成两步 undo item，LIFO 顺序保证最终一致

### 3.3 DocUndoManger 改造

```typescript
import { YMultiDocUndoManager } from 'y-utility/y-multidoc-undomanager'

export class DocUndoManger {
  // 替换: Y.UndoManager → YMultiDocUndoManager
  private _yUndoManager: YMultiDocUndoManager

  // 并行选区栈不变
  private _undoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []
  private _redoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []

  constructor(private doc: BlockCraft.Doc, yBlockMap: Y.Map<YBlock>, options?) {
    this._yUndoManager = new YMultiDocUndoManager([yBlockMap], {
      captureTimeout: options?.captureTimeout || 500,
      trackedOrigins: new Set<any>(options?.trackedOrigins || [ORIGIN_SKIP_SYNC, null])
    })

    // stack-item-added 监听不变
    this._yUndoManager.on('stack-item-added', (evt) => {
      // ... 现有逻辑不变
    })
  }

  /**
   * 注册同步块源的追踪类型。
   * 当页面引用一个同步块时调用。
   */
  addSyncedSource(sourceDoc: SyncedSourceDoc) {
    const trackedTypes = this._collectTrackedTypes(sourceDoc)
    this._yUndoManager.addToScope(trackedTypes)
  }

  /**
   * 移除同步块源。
   * 子文档 destroy 后，YMultiDocUndoManager 自动从栈中清理引用。
   */
  removeSyncedSource(sourceDoc: SyncedSourceDoc) {
    sourceDoc.ydoc.destroy()
  }

  private _collectTrackedTypes(source: SyncedSourceDoc): Y.AbstractType<any>[] {
    const types: Y.AbstractType<any>[] = [source.blockMap, source.children]
    // 收集所有 inner block 的 Y.Text
    for (const [, yblock] of source.blockMap) {
      const ytext = yblock.get('text')
      if (ytext instanceof Y.Text) {
        types.push(ytext)
      }
    }
    return types
  }

  // undo() / redo() 方法签名和逻辑不变
  // _captureSelectionSnapshot / _resolveSelectionSnapshot 需要扩展以支持子文档中的 block
}
```

### 3.4 Undo 时间线示例

```
用户在 Page-A 上的操作序列：
  T1: 编辑 block-A (普通段落) — 写入主文档 yBlockMap
  T2: 编辑 block-B 引用的 synced block inner-1 — 写入 src-1.ydoc
  T3: 编辑 block-C (标题) — 写入主文档 yBlockMap

YMultiDocUndoManager 统一栈：
  [T1: page-a.ydoc → yBlockMap 变更]
  [T2: src-1.ydoc  → inner-1.text 变更]    ← 子文档编辑也在栈内
  [T3: page-a.ydoc → yBlockMap 变更]

Ctrl+Z × 1 → 撤销 T3 (主文档)
Ctrl+Z × 2 → 撤销 T2 (子文档) → 所有引用处同步回退
Ctrl+Z × 3 → 撤销 T1 (主文档)
```

### 3.5 协作场景下的 undo 隔离

```
User A (Page-A, clientID: 100) 编辑 inner-1: 插入 "aaa"
User B (Page-B, clientID: 200) 编辑 inner-1: 插入 "bbb"

Page-A 的 YMultiDocUndoManager (trackedOrigins: {100}):
  只追踪 origin=100 → Ctrl+Z 只撤销 "aaa"，"bbb" 保留

Page-B 的 YMultiDocUndoManager (trackedOrigins: {200}):
  只追踪 origin=200 → Ctrl+Z 只撤销 "bbb"，"aaa" 保留
```

---

## 四、组件模型

### 4.1 SyncedRefBlockComponent

```
BaseBlockComponent
  └── SyncedRefBlockComponent    nodeType: block
        ├── sourceId: string     → 同步块源 ID
        ├── sourceDoc: SyncedSourceDoc  → 加载的子文档
        └── innerHost: InnerEditorHost  → 内部渲染宿主
```

`SyncedRefBlockComponent` 本身不持有内容，它是一个"窗口"，将子文档的 block 树渲染到自己的 DOM 中。

### 4.2 InnerEditorHost — 子文档渲染宿主

每个 `SyncedRefBlockComponent` 实例创建一个 `InnerEditorHost`，负责子文档内 block 的渲染和交互。

```typescript
class InnerEditorHost {
  // 独立实例 — 每个引用处各自拥有
  readonly selectionScope: SelectionScope    // 选区作用域
  readonly inlineRuntimes: Map<string, InlineRuntime>  // per-block 渲染

  // 共享数据 — 来自同一个 SyncedSourceDoc
  readonly sourceDoc: SyncedSourceDoc

  constructor(
    private parentDoc: BlockCraft.Doc,
    private refBlock: SyncedRefBlockComponent,
    sourceDoc: SyncedSourceDoc
  ) {
    this.sourceDoc = sourceDoc
    // 为子文档中每个 editable block 创建 InlineRuntime
    this._initInnerBlocks()
    // 监听子文档变更
    this._observeSourceChanges()
  }
}
```

### 4.3 渲染隔离

```
synced-ref (block-B in Page-A)        synced-ref (block-Y in Page-B)
┌──────────────────────┐              ┌──────────────────────┐
│  InnerEditorHost     │              │  InnerEditorHost     │
│  ┌─ InlineRuntime-1  │              │  ┌─ InlineRuntime-3  │
│  │  ScrollBlot       │              │  │  ScrollBlot       │
│  │  PositionMapper   │              │  │  PositionMapper   │
│  └───────────────────│              │  └───────────────────│
│  ┌─ InlineRuntime-2  │              │  ┌─ InlineRuntime-4  │
│  │  ScrollBlot       │              │  │  ScrollBlot       │
│  │  PositionMapper   │              │  │  PositionMapper   │
│  └───────────────────│              │  └───────────────────│
└──────────────────────┘              └──────────────────────┘
         │                                     │
         └─────── 共享同一个 src-1.ydoc ────────┘
                 (blockMap, children, Y.Text)
```

**关键原则**：数据共享，DOM 独立。
- 每个引用处有自己的 `InlineRuntime` → `ScrollBlot` → DOM 树
- 所有 `InlineRuntime` observe 同一个 `Y.Text`
- 修改任一处 → Yjs 广播 delta → 所有实例各自 `applyDelta` 更新 DOM

### 4.4 数据流

```
用户在 block-B 处输入 "hello"
  │
  ▼
block-B 的 InnerEditorHost
  → InputTransformer 拦截 beforeInput
  → src-1.ydoc.transact(() => {
      inner-1.yText.insert(index, 'hello')
    }, localOrigin)
  │
  ▼
Yjs Y.Text.observe 触发
  │
  ├─ block-B 的 InlineRuntime-1: 本地已应用（origin 判断跳过）
  ├─ block-Y 的 InlineRuntime-3: 收到 delta → applyDelta → DOM 更新
  └─ 远端用户: src-1.ydoc 同步 → 他们的引用实例各自更新
```

---

## 五、生命周期

### 5.1 创建同步块

用户选中若干 block，转为同步块：

```
步骤 1: 创建子文档
  const sourceDoc = new SyncedSourceDoc(nanoid())
  将选中 block 的数据深拷贝到 sourceDoc.blockMap
  设置 sourceDoc.children

步骤 2: 结构变更（主文档事务）
  pageDoc.transact(() => {
    // 删除原始 block
    // 插入 synced-ref block
    syncedRefs.set(refBlockId, sourceDoc.id)
  }, localOrigin)

  undoManager.stopCapturing()    ← 强制拆分 undo item

步骤 3: 注册到 undo
  undoManager.addSyncedSource(sourceDoc)
```

`stopCapturing()` 确保步骤 2 和后续的子文档编辑是独立的 undo item，规避 Bug #642。

### 5.2 粘贴同步块引用

在另一个位置引用已有的同步块：

```
步骤 1: 创建新的 synced-ref block（主文档事务）
  pageDoc.transact(() => {
    insertBlock(synced-ref, { sourceId: existingSourceId })
    syncedRefs.set(newRefBlockId, existingSourceId)
  }, localOrigin)

步骤 2: 加载子文档（如果尚未加载）
  const sourceDoc = await syncedBlockService.loadSource(existingSourceId)

步骤 3: 注册到 undo（如果是该页面首次引用此源）
  undoManager.addSyncedSource(sourceDoc)
```

### 5.3 取消同步

将同步块还原为普通 block：

```
步骤 1: 深拷贝子文档内容到主文档
  pageDoc.transact(() => {
    for (const innerId of sourceDoc.children) {
      // 深拷贝 Y.Text、props 到主文档 yBlockMap
      // 替换 synced-ref block 为普通 block
    }
    syncedRefs.delete(refBlockId)
  }, localOrigin)

步骤 2: 引用计数 -1
  如果该页面不再引用此源 → removeSyncedSource
```

### 5.4 删除引用

```
步骤 1: 删除 synced-ref block（主文档事务）

步骤 2: 检查引用计数
  如果该页面不再引用此源 → removeSyncedSource
  如果全局无引用 → 提示用户是否删除源
```

### 5.5 页面加载

```
页面打开:
  1. 加载 pageDoc
  2. 扫描 syncedRefs，收集所有 sourceId
  3. 批量加载子文档: await Promise.all(sourceIds.map(loadSource))
  4. 对每个子文档: undoManager.addSyncedSource(sourceDoc)
  5. 渲染 block 树，SyncedRefBlockComponent 创建 InnerEditorHost
```

---

## 六、Selection 处理

### 6.1 作用域隔离

同步块内部的选区不能泄漏到主编辑器的 `SelectionManager`：

```
主编辑器 SelectionManager
  ├── 管理 block-A、block-B(整体)、block-C 的选区
  └── 不感知 block-B 内部的 inner-1、inner-2

block-B 的 InnerEditorHost
  └── SelectionScope
       └── 管理 inner-1、inner-2 的选区
```

### 6.2 焦点切换

```
主编辑器有焦点 → 用户点击同步块内部
  1. 主编辑器 SelectionManager.blur()
  2. InnerEditorHost.SelectionScope 获取焦点
  3. 设置光标到点击位置

同步块内部有焦点 → 用户点击主编辑器
  1. InnerEditorHost.SelectionScope.blur()
  2. 主编辑器 SelectionManager 获取焦点
```

### 6.3 键盘导航

```
在同步块内部按 ↑ 到达第一行顶部:
  → InnerEditorHost 检测到越界
  → 通知主编辑器: setCursorAtBlock(refBlock 的前一个兄弟, atEnd)

在同步块内部按 ↓ 到达最后一行底部:
  → InnerEditorHost 检测到越界
  → 通知主编辑器: setCursorAtBlock(refBlock 的后一个兄弟, atStart)

在主编辑器按 ↓ 进入同步块:
  → 主编辑器检测到下一个 block 是 synced-ref
  → 调用 InnerEditorHost.focusFirst()
```

### 6.4 Undo 时的选区恢复

`_captureSelectionSnapshot` 需要扩展，支持子文档中的 block：

```typescript
private _capturePointSafe(
  blockId: string,
  type: 'text' | 'selected',
  offset: number,
  length: number,
  // 新增: 如果 block 在子文档中，传入子文档引用
  sourceDoc?: SyncedSourceDoc
): IRelativeSelectionPoint | null {
  // ...
  const yText = sourceDoc
    ? sourceDoc.blockMap.get(blockId)?.get('text')
    : block.yText

  return {
    type: 'text',
    blockId,
    length,
    sourceId: sourceDoc?.id,  // 新增字段
    position: Y.createRelativePositionFromTypeIndex(yText, safeIndex)
  }
}
```

恢复时需要从对应的 `Y.Doc` 解析 `RelativePosition`：

```typescript
private _resolveSelectionPoint(point: IRelativeSelectionPoint) {
  const ydoc = point.sourceId
    ? this._syncedBlockService.getSourceDoc(point.sourceId).ydoc
    : this.doc.yDoc

  const absPos = Y.createAbsolutePositionFromRelativePosition(point.position, ydoc)
  // ... 后续逻辑不变
}
```

---

## 七、SyncedBlockService — 协调服务

```typescript
class SyncedBlockService {
  private _loadedSources = new Map<string, SyncedSourceDoc>()
  private _refCounts = new Map<string, number>()  // 页面内引用计数

  constructor(
    private doc: BlockCraft.Doc,
    private undoManager: DocUndoManger,
    private sourceProvider: ISyncedSourceProvider  // 抽象加载接口
  ) {}

  /** 加载同步块源（幂等） */
  async loadSource(sourceId: string): Promise<SyncedSourceDoc> {
    if (this._loadedSources.has(sourceId)) {
      this._refCounts.set(sourceId, (this._refCounts.get(sourceId) || 0) + 1)
      return this._loadedSources.get(sourceId)!
    }

    const sourceDoc = await this.sourceProvider.load(sourceId)
    this._loadedSources.set(sourceId, sourceDoc)
    this._refCounts.set(sourceId, 1)
    this.undoManager.addSyncedSource(sourceDoc)
    return sourceDoc
  }

  /** 释放引用 */
  releaseSource(sourceId: string) {
    const count = (this._refCounts.get(sourceId) || 0) - 1
    if (count <= 0) {
      this.undoManager.removeSyncedSource(this._loadedSources.get(sourceId)!)
      this._loadedSources.delete(sourceId)
      this._refCounts.delete(sourceId)
    } else {
      this._refCounts.set(sourceId, count)
    }
  }

  /** 创建新的同步块源 */
  createSource(blocks: IBlockSnapshot[]): SyncedSourceDoc {
    const sourceDoc = new SyncedSourceDoc(nanoid())
    // 将 blocks 写入 sourceDoc
    sourceDoc.initFromSnapshots(blocks)
    this._loadedSources.set(sourceDoc.id, sourceDoc)
    this._refCounts.set(sourceDoc.id, 0)
    this.undoManager.addSyncedSource(sourceDoc)
    return sourceDoc
  }

  getSourceDoc(sourceId: string): SyncedSourceDoc {
    return this._loadedSources.get(sourceId)!
  }
}
```

### ISyncedSourceProvider — 抽象加载接口

```typescript
interface ISyncedSourceProvider {
  /** 加载子文档（从服务器/本地存储） */
  load(sourceId: string): Promise<SyncedSourceDoc>

  /** 持久化子文档 */
  save(sourceDoc: SyncedSourceDoc): Promise<void>

  /** 删除子文档 */
  delete(sourceId: string): Promise<void>
}
```

服务端实现可以用 WebSocket provider 同步子文档，也可以用 IndexedDB 做本地缓存。

---

## 八、IME 输入处理

同步块内的 IME 输入与主编辑器共享同一套 `CompositionSession` 机制，但作用于子文档的 `Y.Text`：

```
compositionStart:
  → InnerEditorHost 的 InputTransformer 创建 CompositionSession
  → OneShotCursorAnchor capture(innerBlock, index)
    → Y.createRelativePositionFromTypeIndex(sourceDoc.yText, index)

compositionEnd:
  → sourceDoc.ydoc.transact(() => {
      innerBlock.yText.insert(...)
    }, ORIGIN_SKIP_SYNC)
  → innerBlock.rerender()
  → setInlineRange() 同步恢复光标
```

`ORIGIN_SKIP_SYNC` 在子文档事务中同样有效——跳过本实例的 `applyDeltaToView`，由 `rerender()` 全量重建。其他引用实例通过 `Y.Text.observe` 增量更新。

---

## 九、与现有模块的兼容性

| 现有模块 | 影响 | 改动 |
|----------|------|------|
| `DocUndoManger` | 内部 `Y.UndoManager` → `YMultiDocUndoManager` | 替换类型 + 新增 `addSyncedSource` / `removeSyncedSource` |
| `InlineRuntime` | 无需改动 | 已是 per-block 实例，只需让它 observe 子文档的 Y.Text |
| `SelectionManager` | 需要 scope 隔离 | 新增 `SelectionScope` 概念 |
| `InputTransformer` | 需要感知焦点在哪个 Host | 根据当前焦点路由到主编辑器或 InnerEditorHost |
| `CompositionSession` | 无需改动 | 已绑定到具体的 block/Y.Text |
| `DocCRUD` | 需要扩展 | 支持对子文档的 block 增删改查 |
| `ClipboardManager` | 需要扩展 | 复制同步块引用 vs 复制内容，两种语义 |
| `BlockControllerPlugin` | 需要扩展 | 同步块整体的拖拽手柄、右键菜单 |
| `UIEventDispatcher` | 需要路由 | 事件分发时区分主编辑器 / InnerEditorHost |
| `Adapter (HTML/Markdown)` | 需要扩展 | `synced-ref` 类型的序列化/反序列化 |

---

## 十、实施路径

### Phase 1：基础框架

1. `SyncedSourceDoc` 数据模型
2. `DocUndoManger` 改造（`Y.UndoManager` → `YMultiDocUndoManager`）
3. `SyncedBlockService` 协调服务
4. `ISyncedSourceProvider` 本地实现（内存/IndexedDB）

### Phase 2：渲染与交互

5. `SyncedRefBlockComponent` 组件
6. `InnerEditorHost` 子文档渲染宿主
7. Selection scope 隔离
8. 焦点切换 + 键盘导航

### Phase 3：完整功能

9. 创建同步块（选中 block → 转为同步块）
10. 粘贴同步块引用
11. 取消同步（还原为普通 block）
12. 剪贴板支持（复制引用 / 复制内容）
13. Adapter 扩展（HTML/Markdown 序列化）

### Phase 4：服务端集成

14. `ISyncedSourceProvider` 服务端实现
15. 子文档 WebSocket 同步
16. 引用计数 + GC（全局无引用时清理子文档）
