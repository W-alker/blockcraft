# Selection 框架设计文档

## 一、架构总览

Selection 模块采用 **anchor/head 端点模型**，以 model 为核心驱动，DOM 作为输出。

```
用户操作 ──→ DOM selectionchange ──→ normalizeRange() ──→ BlockSelection(anchor, head)
                                                                    │
程序操作 ──→ setCursorAt / setSelection ──────────────────────────→ selectionChange$.next()
                                                                    │
                                                             selectedManager.setSelected()
                                                                    │
                                                              DOM class 更新
```

### 文件结构

```
framework/modules/selection/
├── types.ts              # 类型定义 (ISelectionPoint, ISelectionJSON, ...)
├── blockSelection.ts     # BlockSelection 类 (anchor/head, 派生属性)
├── normalize.ts          # DOM → model 纯函数 (normalizeRange)
├── index.ts              # SelectionManager (协调器, 公开 API)
├── selection-keyboard.ts # 键盘导航 (方向键, Shift 选择, Home/End, Escape)
├── selected-manager.ts   # DOM class 管理 (.selected, .focused, .all-selected)
└── createFakeRange.ts    # 视觉选区覆盖层 (协作光标, 搜索高亮)
```

---

## 二、核心类型

### ISelectionPoint — 选区端点

每个端点表示文档中的一个位置，分为两种类型：

```typescript
// 可编辑块内的文本位置
interface ITextSelectionPoint {
  readonly blockId: string
  readonly type: 'text'
  readonly offset: number              // 块内字符偏移
  readonly block: EditableBlockComponent  // 惰性解析 (non-enumerable getter)
}

// 不可编辑块的整体选中
interface ISelectedSelectionPoint {
  readonly blockId: string
  readonly type: 'selected'
  readonly block: BaseBlockComponent      // 惰性解析
}

type ISelectionPoint = ITextSelectionPoint | ISelectedSelectionPoint
```

**惰性解析 (lazy block resolution)**：`block` 属性通过 `Object.defineProperty` 定义为 non-enumerable getter，访问时才调用 `getBlockById(blockId)` 解析。序列化时（`JSON.stringify`、spread）自动跳过。

### ISelectionJSON — 序列化格式

```typescript
interface ISelectionPointJSON {
  blockId: string
  type: 'text' | 'selected'
  offset?: number                      // type='text' 时有值
}

interface ISelectionJSON {
  anchor: ISelectionPointJSON
  head: ISelectionPointJSON
  commonParent: string
}
```

用于 Undo/Redo 快照、协作光标同步、选区恢复 (`replay`)。

---

## 三、BlockSelection

核心选区模型，由两个端点 + 公共父级构成。所有派生属性按需计算。

### 构造

```typescript
class BlockSelection {
  constructor(
    readonly anchor: ISelectionPoint,     // 用户开始选择的位置
    readonly head: ISelectionPoint,       // 用户结束选择的位置 (focus)
    readonly commonParent: string,        // 最近公共祖先 block ID
    _getBlockById: (id: string) => BaseBlockComponent,
    _comparePosition: (a: string, b: string) => number,
  )
}
```

### 有序端点 vs 方向端点

```
anchor/head：保留用户选择方向（anchor 可能在 head 之后）
start/end：  按文档顺序排列（start 始终在 end 之前）

例：用户从右向左拖选
  anchor = {blockId: 'b1', offset: 10}  (右侧, 先点击)
  head   = {blockId: 'b1', offset: 3}   (左侧, 拖到这里)
  start  = head  (offset 3, 文档顺序靠前)
  end    = anchor (offset 10, 文档顺序靠后)
  direction = 'backward'
```

### 属性速查

| 属性 | 类型 | 说明 |
|------|------|------|
| `anchor` | `ISelectionPoint` | 选区起始端点（用户操作起点） |
| `head` | `ISelectionPoint` | 选区结束端点（用户操作终点 / focus） |
| `start` | `ISelectionPoint` | 文档顺序靠前的端点 |
| `end` | `ISelectionPoint` | 文档顺序靠后的端点 |
| `direction` | `'forward' \| 'backward'` | 由 anchor/head 顺序推导 |
| `collapsed` | `boolean` | 光标（零宽选区） |
| `isInSameBlock` | `boolean` | 两端点在同一个 block 内 |
| `firstBlock` | `BaseBlockComponent` | `start.block` |
| `lastBlock` | `BaseBlockComponent` | `end.block` |
| `isStartOfBlock` | `boolean` | start 在块首 |
| `isEndOfBlock` | `boolean` | end 在块尾 |
| `isAllSelected` | `boolean` | 同块: 两端均 `selected`；跨块: `isStartOfBlock && isEndOfBlock` |
| `isEmpty` | `boolean` | 同块、同偏移 |

### 方法

```typescript
// 判断某个位置是否在选区内
contains(blockId: string, offset?: number): boolean

// 序列化
toJSON(): ISelectionJSON           // 新格式 {anchor, head, commonParent}
toLegacyJSON(): IBlockSelectionJSON  // 兼容格式 {from, to, collapsed, commonParent}
```

---

## 四、SelectionManager

选区模块的协调器，挂载在 `doc.selection` 上。

### 数据流

```
┌──────────────────────────────────────────────────────────┐
│  Path A: 用户操作 (DOM → Model)                          │
│                                                          │
│  document selectionchange                                │
│    │  (skip if _suppressRecalculate || isComposing)       │
│    ▼                                                     │
│  recalculate()                                           │
│    │  document.getSelection().getRangeAt(0)              │
│    │  normalizeRange(range) → {anchor, head}             │
│    │  new BlockSelection(anchor, head, commonParent)     │
│    ▼                                                     │
│  _applyState(blockSelection)                             │
│    ├→ selectionChange$.next(blockSelection)              │
│    └→ selectedManager.setSelected(blockSelection)        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Path B: 程序操作 (Model → DOM)                          │
│                                                          │
│  setCursorAt(block, index)                               │
│  setSelection(from, to)                                  │
│  selectBlock(block)                                      │
│    │  mapper.modelPointToDomPoint() → DOM node+offset    │
│    │  document.getSelection().setPosition/addRange()     │
│    ▼                                                     │
│  selectionchange 事件触发 → recalculate()                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  _suppressRecalculate                                    │
│    当程序主动写 DOM 选区时，置 true 防止 selectionchange  │
│    回读形成循环。通过 requestAnimationFrame 延迟解除。    │
└──────────────────────────────────────────────────────────┘
```

### 公开 API

**观察**

| 方法 | 说明 |
|------|------|
| `value` | 当前 `BlockSelection \| null` |
| `selectionChange$` | `BehaviorSubject<BlockSelection \| null>` |
| `changeObserve()` | 带 `takeUntil(onDestroy$)` 的可观察流 |
| `nextChangeObserve()` | 下一次变化（一次性） |
| `afterNextChange(fn)` | 下一次变化后回调 |

**设置选区**

| 方法 | 说明 |
|------|------|
| `setCursorAt(block, index)` | 设置光标到可编辑块的指定偏移 |
| `extendTo(block, index)` | 从当前 anchor 扩展到新位置 |
| `setSelection(from, to?)` | 从序列化点设置 DOM 选区 |
| `selectBlock(block)` | 选中整个块 |
| `selectOrSetCursorAtBlock(block, atStart)` | 可编辑块→光标；不可编辑块→选中 |
| `setCursorAtBlock(block, atStart)` | 递归查找可编辑后代 |
| `selectAllChildren(block)` | 选中块内所有内容 |
| `blur()` | 清除选区 |
| `replay(json)` | 从 `ISelectionJSON` 或 `IBlockSelectionJSON` 恢复选区 |

**几何查询**

| 方法 | 说明 |
|------|------|
| `getSelectionRect()` | 选区外接矩形 |
| `getSelectionRects()` | 选区所有行矩形 |
| `getSelectedText()` | 选中文本（跨块用 `\n` 连接） |
| `scrollSelectionIntoView()` | 滚动到选区可见 |

**视觉覆盖**

| 方法 | 说明 |
|------|------|
| `createFakeRange(source, config?)` | 创建 FakeRange 视觉覆盖（接受 `BlockSelection` / `ISelectionJSON` / legacy JSON） |

---

## 五、normalizeRange — DOM → Model 转换

纯函数，无副作用。将浏览器 `StaticRange` 转换为 `{anchor, head}` 端点对。

```typescript
function normalizeRange(
  range: StaticRange,
  getBlockById: (id: string) => BaseBlockComponent,
  options?: { isComposing?: boolean }
): INormalizedEndpoints    // { anchor: ISelectionPoint, head: ISelectionPoint }
```

### 转换流程

```
StaticRange { startContainer, startOffset, endContainer, endOffset, collapsed }
  │
  ├─ resolveBlock(node)         通过 closetBlockId(node) 查找所属 block
  │
  ├─ resolvePoint(block, node, offset)
  │    ├─ EditableBlockComponent → { type: 'text', offset: mapper.domPointToModelPoint(...) }
  │    └─ 其他 block            → { type: 'selected' }
  │
  ├─ 特殊处理:
  │    ├─ INLINE_END_BREAK_CLASS → offset = block.textLength
  │    ├─ hostElement ≠ containerElement → offset = 0 或 textLength
  │    └─ edit-container offset=0 → 回退到前一个兄弟块
  │
  └─ return { anchor, head }    collapsed 时 head === anchor (同一引用)
```

### 与 InlinePositionMapper 的关系

```
normalizeRange                    InlinePositionMapper
     │                                  │
     │  resolvePoint() 内部调用:        │
     │  block.runtime.mapper             │
     │    .domPointToModelPoint(         │
     │       container, node, offset     │  遍历 ScrollBlot 叶子节点
     │    )                              │  累加前驱 blot 长度
     │    → model index                  │  返回字符偏移
     └──────────────────────────────────┘
```

---

## 六、DOM Class 管理 (SelectionSelectedManager)

根据 `BlockSelection` 状态更新 DOM 元素的 CSS class。

| 条件 | CSS class | 目标元素 |
|------|-----------|----------|
| 可编辑块被聚焦 | `.focused` | `block.hostElement` |
| 不可编辑块被选中 | `.selected` | `block.hostElement` |
| 全选 | `.all-selected` | `root.hostElement` |

每次 `selectionChange$` 触发时：先清除所有旧 class，再根据新选区重新设置。跨块选区会标记 start、end、以及中间所有块。

---

## 七、FakeRange — 视觉选区覆盖

不修改浏览器原生 Selection，纯视觉渲染选区高亮。

**使用场景**：
- 协作光标（远端用户的选区）
- 搜索高亮
- 弹窗打开期间保持选区可见
- Link 编辑态的选区指示

```typescript
const fake = doc.selection.createFakeRange(selection, { bgColor: '#ff0' })
// ...
fake.destroy()
```

**实现**：
- 对文本范围：调用 `mapper.modelRangeToDomRange()` 获取 DOM Range，读取 `getClientRects()` 生成绝对定位 `<span class="blockcraft-cursor">`
- 对整块选中：包裹整个 `hostElement`
- 跨块时：start 块 + between 块 + end 块各自独立渲染

---

## 八、键盘导航 (SelectionKeyboard)

| 快捷键 | 行为 |
|--------|------|
| Arrow Up/Down/Left/Right | 折叠选区 → 移动光标；在块边界跳转到相邻块；void 块自动选中 |
| Shift + Arrow Up/Down | 向上/下扩展选区到相邻块 |
| Shift + Arrow Left/Right | 在 head 端点有空间时交给浏览器；到块边界时扩展到相邻块 |
| Ctrl/Cmd + A | 全选：块内 → 父级 → 根级递进扩大 |
| Home / End | 移动到行首/行尾（`plainTextOnly` 块感知换行符） |
| Shift + Home/End | 扩展选区到行首/行尾 |
| Escape | 折叠非空选区到方向对应的端点 |

所有键盘处理使用 `@BindHotKey` 装饰器注册，通过 `sel.start` / `sel.end` / `sel.head` / `sel.direction` 访问选区状态。

---

## 九、与协作 (Yjs) 的集成

### 光标追踪

`OneShotCursorAnchor` 使用 `Y.RelativePosition` 在异步操作期间追踪光标：

```
capture(block, index)
  → Y.createRelativePositionFromTypeIndex(block.yText, index)
  → 存储 RelativePosition

远端用户插入/删除文本...

resolve()
  → Y.createAbsolutePositionFromRelativePosition(position, yDoc)
  → 映射到新的绝对 index
```

### Undo/Redo 选区恢复

`DocUndoManager` 使用 `Y.RelativePosition` 追踪选区端点，确保协同安全。

**快照捕获：**
```
BlockSelection
  → _captureSelectionSnapshot()
    → 同块: from = RelativePosition(start.offset) + length(end.offset - start.offset)
    → 跨块: from = RelativePosition(start.offset) + length(块尾), to = RelativePosition(0) + length(end.offset)
  → IRelativeSelectionSnapshot { from, to }
```

**快照恢复：**
```
IRelativeSelectionSnapshot
  → _resolveSelectionPoint(point)
    → Y.createAbsolutePositionFromRelativePosition(position, yDoc) → 绝对 index
    → clamp(index, 0, block.textLength) + clamp(length, 0, maxLength)
  → IBlockSelectionJSON { from, to }
  → doc.selection.replay(json)
```

**预捕获机制 — `captureSelectionBeforeChange()`**：

`stack-item-added` 事件在 Yjs transaction 结束后触发，此时 yText 已被修改。直接用 `_captureSelectionSnapshot()` 会基于修改后的 yText 创建 `RelativePosition`，导致 undo 后偏移错误。

解决方案：在所有修改 yText 的操作之前调用 `captureSelectionBeforeChange()`，预先存入 `_pendingSnapshot`。`stack-item-added` handler 优先使用它。

调用点：
- `_replaceText()` — 所有文本替换操作
- `_deleteAllSelected()` — 全选删除
- `_handleBeforeInput()` — 同段落非折叠选区编辑

### 远端变更

```typescript
// crud.ts: 非本地事务后
if (!tr.local) {
  requestAnimationFrame(() => doc.selection.recalculate())
}
```

### _suppressRecalculate 机制

`_suppressRecalculate` 标志用于防止 `selectionchange` 事件触发不必要的 `recalculate()`。

当前程序化选区操作（`setCursorAt`、`setSelection` 等）设置 DOM 选区后，浏览器会异步触发 `selectionchange`。`recalculate()` 从 DOM 反读选区创建 `BlockSelection`，对于用户交互路径这是正确的。但程序化路径中，调用方已经知道期望的选区状态，`recalculate()` 的 DOM 反读可能因浏览器 Range 标准化、跨父级约束等原因产生错误结果。

```
selectionchange handler:
  if (_suppressRecalculate) → 跳过 recalculate()
  if (isComposing)          → 跳过 (IME 期间由 CompositionSession 管理)
  else                      → recalculate()
```

> **注意**：当前 `_suppressRecalculate` 为预留机制，程序化路径仍通过 `selectionchange → recalculate()` 创建模型状态。后续可改为程序化路径直接创建 `BlockSelection` 并抑制 `selectionchange` 回路。

---

## 十、选区场景图解

### 1. 光标 (collapsed)

```
anchor = head = { blockId: 'p1', type: 'text', offset: 5 }

  [ Hello| world ]     ← 光标在 offset 5
         ↑
     start = end
```

`collapsed = true`, `isInSameBlock = true`, `direction = 'forward'`

### 2. 同块范围选区

```
anchor = { blockId: 'p1', type: 'text', offset: 0 }
head   = { blockId: 'p1', type: 'text', offset: 5 }

  [ [Hello] world ]    ← 选中 "Hello"
    ↑     ↑
  start  end
```

`collapsed = false`, `isInSameBlock = true`

### 3. 跨块选区

```
anchor = { blockId: 'p1', type: 'text', offset: 5 }
head   = { blockId: 'p2', type: 'text', offset: 3 }

  p1: [ Hello [world] ]     ← start 从 offset 5 到块尾
  p2: [ [Foo] bar ]          ← end 从块首到 offset 3
```

`isInSameBlock = false`, `firstBlock = p1`, `lastBlock = p2`

### 4. void 块选中

```
anchor = head = { blockId: 'img1', type: 'selected' }

  [ 🖼 image block ]     ← 整块被选中
```

`isAllSelected = true` (当 anchor 和 head 都是 selected)

---

## 十一、约束与限制

1. **跨父容器选区被折叠**：当 anchor 和 head 不在同一个父级 block 下时（如从 column A 拖到 column B），选区会被强制 `collapse()`。
2. **单选区**：不支持多个不相邻选区（Ctrl+Click 多选）。
3. **IME 期间跳过 recalculate**：`isComposing = true` 时不处理 `selectionchange`，由 `CompositionSession` 管理光标。
