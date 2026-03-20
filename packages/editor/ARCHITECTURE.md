# BlockCraft 框架技术原理文档

## 一、架构总览

BlockCraft 是一个基于 Angular 的协同文档编辑框架，底层使用 Yjs（CRDT）实现实时协同。核心设计理念：

```
┌─────────────────────────────────────────────────────────┐
│                    EditorComponent                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  BlockCraftDoc                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │  DocCRUD  │ │  DocVM   │ │ UIEventDispatcher │  │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │Selection │ │Clipboard │ │  InputTransformer  │  │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │UndoManger│ │ Plugins  │ │  SchemaManager    │  │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Block Component Tree                  │  │
│  │  RootBlock → [Paragraph, Code, Table, Image, ...] │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 二、文档模型（Document Model）

### 2.1 BlockCraftDoc — 中枢

`BlockCraftDoc` 是整个系统的中枢，协调所有子系统。

**初始化流程：**
```
initBySnapshot(snapshot) / initByYBlock(yBlock)
  → DocVM.createComponentBySnapshot() / createComponentByYBlocks()
  → Angular 创建组件树
  → _initEditor()
      → 初始化 Selection、Clipboard、InputTransformer
      → 注册所有 Plugins（plugin.register(doc)）
      → 绑定 Hotkeys
  → afterInit$.next(true)
```

**关键属性：**
| 属性 | 类型 | 职责 |
|------|------|------|
| `crud` | `DocCRUD` | Block 增删改查 |
| `vm` | `DocVM` | 组件生命周期管理 |
| `event` | `UIEventDispatcher` | 事件分发 |
| `selection` | `SelectionManager` | 选区管理 |
| `clipboard` | `ClipboardManager` | 剪贴板 |
| `inputManger` | `InputTransformer` | 输入处理 |
| `undoManager` | `DocUndoManger` | 撤销/重做 |
| `schemaManager` | `SchemaManager` | Block Schema 注册 |
| `readonlySwitch$` | `BehaviorSubject<boolean>` | 只读模式 |

### 2.2 数据结构

**Block Snapshot（序列化格式）：**
```typescript
interface IBlockSnapshot {
  id: string
  flavour: BlockFlavour        // 'paragraph' | 'code' | 'table' | ...
  nodeType: BlockNodeType      // root | block | void | editable
  props: IBlockProps           // 块特有属性
  meta: IMetadata              // 元数据（折叠、选中、时间戳等）
  children: IBlockSnapshot[] | InlineModel  // 子块 或 行内内容
}
```

**Block 节点类型：**
| 类型 | 说明 | 示例 |
|------|------|------|
| `root` | 文档根节点，唯一 | RootBlock |
| `block` | 容器节点，有子块 | Table, Callout, Columns |
| `editable` | 可编辑叶节点，有行内内容 | Paragraph, Code, Bullet |
| `void` | 不可编辑叶节点 | Image, Divider, Bookmark |

**Yjs 映射关系：**
```
NativeBlockModel ←→ Y.Map (YBlock)
  props          ←→ Y.Map
  meta           ←→ Y.Map
  children       ←→ Y.Array<string>  (子块 ID 列表)
  text content   ←→ Y.Text           (行内内容)
```

通过 `proxyMap<T>(obj, yObj)` 创建代理对象，JS 属性修改自动同步到 Yjs。

---

## 三、Block 组件系统

### 3.1 组件继承体系

```
BaseBlockComponent (所有块的基类)
  ├── EditableBlockComponent (可编辑块)
  │     ├── ParagraphBlockComponent
  │     ├── CodeBlockComponent
  │     ├── BulletBlockComponent
  │     ├── OrderedBlockComponent
  │     ├── TodoBlockComponent
  │     ├── BlockQuoteBlockComponent
  │     ├── CaptionBlockComponent
  │     └── MermaidTextareaBlockComponent
  │
  ├── RootBlockComponent
  ├── CalloutBlockComponent
  ├── TableBlockComponent / TableRowBlock / TableCellBlock
  ├── ImageBlockComponent
  ├── DividerBlockComponent
  ├── BookMarkBlockComponent
  ├── AttachmentBlockComponent
  ├── MermaidBlockComponent
  ├── ColumnsBlockComponent / ColumnBlockComponent
  └── BaseEmbedBlockComponent
```

### 3.2 BaseBlockComponent 生命周期

```
ngOnInit() → _init()
  → 初始化 props/meta 代理（proxyMap）
  → 缓存 children IDs
  → 订阅 onPropsChange / onChildrenChange / onTextChange

ngAfterViewInit()
  → 设置 data-block-id, data-node-type 属性
  → void 块创建 gap space
  → 发射 onViewInit$

ngOnDestroy()
  → 发射 onDestroy$
```

### 3.3 EditableBlockComponent 扩展

在 BaseBlockComponent 基础上增加：

**文本操作方法：**
```typescript
insertText(index, text, attributes?)   // 插入文本
deleteText(index, length)              // 删除文本
replaceText(index, length, text, attrs?) // 替换文本
formatText(index, length, attributes)  // 格式化文本
applyDeltaOperations(delta)            // 应用 Delta 操作
textContent(): string                  // 获取纯文本
```

**行内渲染：**
```typescript
get containerElement: HTMLElement      // .edit-container 元素
get inlineManager: InlineManager       // 行内管理器
rerender()                             // 重新渲染行内内容
setInlineRange(index, length?)         // 设置光标位置
```

**事件流：**
```typescript
onTextChange: Observable<ITextChangeEvent>      // 文本变化
onPropsChange: Observable<Set<string>>          // 属性变化
onChildrenChange: Observable<IChildrenChangeEvent> // 子块变化
```

### 3.4 Block Schema 注册

```typescript
const MyBlockSchema: IBlockSchemaOptions = {
  flavour: 'my-block',
  nodeType: BlockNodeType.editable,
  component: MyBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn,
  metadata: {
    version: 1,
    label: '我的块',
    description: '自定义块',
    isLeaf: true,
    renderUnit: true,
    includeChildren: ['root', 'callout'],  // 允许的父块
  }
}
```

---

## 四、行内编辑系统（Inline Editing）

### 4.1 总体架构

行内编辑系统负责将 Yjs Y.Text 中的 Delta 数据渲染为可编辑的 DOM，并处理用户输入（包括 IME 输入法）。

```
┌─────────────────────────────────────────────────────────┐
│                   数据层 (Source of Truth)                │
│                                                         │
│    Y.Text ─── toDelta() ──→ DeltaInsert[]               │
│      │                         │                        │
│      │ applyDelta()            │ 全量: build()          │
│      │ (协同/本地事务)          │ 增量: applyDelta()      │
│      ▼                         ▼                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Blot Tree (运行时中间层)              │    │
│  │                                                   │    │
│  │  ScrollBlot (root)                                │    │
│  │    ├── TextBlot("Hello ")     [length=6]          │    │
│  │    ├── TextBlot("world")      [length=5, bold]    │    │
│  │    ├── EmbedBlot(mention)     [length=1]          │    │
│  │    └── BreakBlot              [length=0]          │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                               │
│                         │ 每个 Blot 拥有并管理自己的 DOM   │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │              DOM (浏览器渲染层)                     │    │
│  │                                                   │    │
│  │  <div.edit-container>                             │    │
│  │    <span data-zero-space>​</span>                  │    │
│  │    <c-element>                                    │    │
│  │      <c-text>Hello </c-text>                      │    │
│  │    </c-element>                                   │    │
│  │    <c-element a:bold="true">                      │    │
│  │      <c-text>world</c-text>                       │    │
│  │    </c-element>                                   │    │
│  │    <c-element>                                    │    │
│  │      <span contenteditable="false">@张三</span>   │    │
│  │      <span data-zero-space>​</span>               │    │
│  │    </c-element>                                   │    │
│  │    <c-element class="bc-end-break"><br></c-element>│   │
│  │  </div>                                           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**核心设计原则：**
- Y.Text (Yjs CRDT) 是唯一的数据源，Blot 树不参与持久化或协同协议
- Blot 树是轻量级运行时中间层，每个 Blot 持有自己的 DOM 节点
- DOM 从不被直接查询来反推模型状态（除了 IME 输入法合成期间）
- 增量更新优先：大多数变更通过 `applyDelta()` 增量修补，避免全量重建

### 4.2 Delta 模型

采用 Quill 兼容的 Delta 格式：

```typescript
// 快照（Y.Text.toDelta() 的输出）
type DeltaInsert = {
  insert: string | object    // 文本 或 嵌入对象 (如 {mention: "张三"})
  attributes?: IInlineNodeAttrs
}

// 增量操作（描述变更）
type DeltaOperation = {
  insert?: string | object   // 插入
  delete?: number            // 删除 N 个字符
  retain?: number            // 保留 N 个字符
  attributes?: IInlineNodeAttrs  // 与 retain 搭配 = 格式化
}
```

**属性命名空间：**
| 前缀 | 用途 | 示例 |
|------|------|------|
| `a:` | HTML 属性 | `a:bold`, `a:italic`, `a:link` |
| `s:` | CSS 样式 | `s:color`, `s:background`, `s:fontSize` |
| `d:` | data 属性 | `d:lineBreak` |

特殊属性：`mentionId`, `mentionType` 等用于 embed 元数据，不带前缀。

### 4.3 Blot 类型体系

```
IBlot (接口)
  │
  ├── ScrollBlot      type='scroll'  根容器，管理子 blot 列表
  │     └── children: IBlot[]
  │
  └── LeafBlot (抽象基类)
        ├── TextBlot    type='text'   连续同格式文本，length = 文本长度
        ├── EmbedBlot   type='embed'  原子嵌入，length = 1
        ├── BreakBlot   type='break'  结尾换行，length = 0
        └── CursorBlot  type='cursor' IME 合成期光标占位，length = 0
```

**每种 Blot 的 DOM 结构：**

| Blot | DOM | 说明 |
|------|-----|------|
| TextBlot | `<c-element [attrs]><c-text>文本</c-text></c-element>` | 直接操作 Text 节点 |
| EmbedBlot | `<c-element [attrs]><span ce="false">视图</span><span data-zero-space>​</span></c-element>` | 不可编辑 + 光标停靠零宽空格 |
| BreakBlot | `<c-element class="bc-end-break"><br></c-element>` | 保证空行可输入 |
| CursorBlot | `<c-element class="bc-cursor"><c-text>​</c-text></c-element>` | 临时插入，IME 结束后移除 |

### 4.4 InlineRuntime — 每块协调器

每个 `EditableBlockComponent` 拥有一个 `InlineRuntime` 实例：

```typescript
class InlineRuntime {
  scrollBlot: ScrollBlot     // Blot 树
  mapper: InlinePositionMapper  // 位置映射

  render(deltas)             // 全量重建 Blot 树 + DOM
  applyDelta(ops)            // 增量修补
  modelPointToDom(index)     // 模型偏移 → DOM 点
  domPointToModel(node, off) // DOM 点 → 模型偏移
  findBlotByOffset(offset)   // 查找偏移处的叶子 Blot
}
```

**初始化流程：**
```
EditableBlockComponent.ngAfterViewInit()
  → _initRuntime()
      → new InlineRuntime(containerElement, embedConverters)
          → new ScrollBlot(container, embedConverters)
          → new InlinePositionMapper().setScrollBlot(scrollBlot)
  → rerender()
      → scrollBlot.build(yText.toDelta())
```

### 4.5 两种渲染路径

#### 4.5.1 全量渲染 — `ScrollBlot.build(deltas)`

- 销毁所有旧 Blot，清空 DOM
- 遍历 DeltaInsert[]，为每个 delta 创建 TextBlot 或 EmbedBlot
- 重建完整 DOM：`container.replaceChildren(zeroSpace, ...blots, breakBlot)`
- 用于：首次渲染、语言切换、IME compositionEnd 后、一致性校验回退

#### 4.5.2 增量修补 — `ScrollBlot.applyDelta(ops)`

遍历 DeltaOperation[]，对 Blot 树执行增量操作：

```
输入: [{ retain: 6 }, { delete: 5 }, { insert: "world!", attributes: { 'a:bold': true } }]

处理流程:
  retain(6):
    - 模型游标前进 6 个字符
    - 如果携带 attributes → _formatRange(): 拆分 TextBlot 并应用格式

  delete(5):
    - _deleteRange(): 从当前游标删除 5 个字符
    - 可能删除整个 Blot 或截断 TextBlot

  insert("world!", {bold}):
    - 优化路径: 如果当前位置的 TextBlot 属性匹配 → insertAt() 原地追加
    - 如果前一个 TextBlot 属性匹配 → 追加到前一个 Blot 末尾
    - 回退路径: 创建新 Blot → _insertBlotAt() 插入（可能拆分现有 TextBlot）

  清理: _cleanupEmptyLeaves()
    - 移除长度为 0 的 TextBlot
    - 合并相邻且属性相同的 TextBlot（避免碎片化）
```

**关键操作的 Blot 树变化示例：**
```
插入: "abc" 插入到 TextBlot("Hello") 的偏移 5
  Before: [TextBlot("Hello")]
  After:  [TextBlot("Helloabc")]    ← 属性匹配，原地 insertAt

格式化: 偏移 2-4 加粗
  Before: [TextBlot("Hello")]
  After:  [TextBlot("He"), TextBlot("ll", {bold}), TextBlot("o")]  ← split + format

删除: 偏移 2 删除 3 个字符
  Before: [TextBlot("Hello")]
  After:  [TextBlot("Heo")]  ← 可能合并为更少的 Blot，但先 deleteAt 再 cleanup
```

### 4.6 一致性校验

每次 `applyDelta()` 后，`EditableBlockComponent._applyDeltaToView()` 执行一致性校验：

```typescript
_applyDeltaToView(deltas) {
  try {
    this._runtime.applyDelta(deltas)
    if (!this._verifyBlotConsistency()) {
      this.rerender()  // 回退到全量重建
    }
  } catch (e) {
    this.rerender()    // 异常保护
  }
}
```

校验逻辑：比较 Blot 树的文本内容与 `yText.toDelta()` 的文本内容。
- 遍历 Blot 树：TextBlot 贡献其文本，EmbedBlot 贡献 `\ufffc`
- 遍历 Delta 模型：文本 insert 原样，对象 insert 记为 `\ufffc`
- 长度或内容不匹配 → 回退到 `rerender()` 全量重建

这是一个安全网机制，确保 applyDelta 的任何 bug 不会导致 Blot 树与 Y.Text 永久分歧。

### 4.7 位置映射 — InlinePositionMapper

`InlinePositionMapper` 在模型偏移（字符索引）和 DOM 点（node + offset）之间双向映射。

#### 4.7.1 Model → DOM (`modelPointToDomPoint`)

```
遍历叶子 Blot，递减剩余偏移量:
  - TextBlot: 返回 (textNode, remaining)
  - EmbedBlot:
    - remaining=0 → 返回 embed 容器的 span[ce=false]
    - remaining=1 → 返回 gap 零宽空格的 Text 节点
  - 偏移量=0 → 返回 leading zero-space
```

#### 4.7.2 DOM → Model (`domPointToModelPoint`)

```
1. 找到 node 所属的 <c-element>
2. 在 leaves 中匹配该 <c-element> 对应的 Blot
3. 累加该 Blot 之前所有叶子的长度 = 基础偏移
4. 计算 node 在 Blot 内的局部偏移
5. 返回 基础偏移 + 局部偏移
```

### 4.8 嵌入系统 — EmbedConverter

嵌入对象（mention、link、latex 等）通过 `EmbedConverter` 注册：

```typescript
interface EmbedConverter {
  type: string                              // 嵌入类型名称 (如 'mention')
  toView(delta: DeltaInsertEmbed): HTMLElement  // delta → DOM 视图
  onDestroy?(el: HTMLElement, delta: DeltaInsertEmbed): void  // 清理回调
}
```

**嵌入 delta 格式：**
```typescript
{ insert: { mention: "张三" }, attributes: { mentionId: "u123", mentionType: "user" } }
{ insert: { link: "https://example.com" }, attributes: { "a:link": "https://..." } }
{ insert: { latex: "E=mc^2" } }
```

`EmbedBlot` 持有其 converter 引用和原始 delta，`detach()` 时自动调用 `converter.onDestroy()`。

### 4.9 输入处理管线

#### 4.9.1 控制渲染模式

BlockCraft 使用 **controlled rendering**（受控渲染）：拦截浏览器输入，手动写入 Y.Text，由 Y.Event 驱动视图更新。

```
用户按键 'a'
  → beforeInput 事件
  → InputTransformer.handleBeforeInput()
      → e.preventDefault()                     // 阻止浏览器默认插入
      → doc.crud.transact(() => {
          block.yText.insert(index, 'a')      // 写入 Y.Text
        })
      → Y.Event 触发
      → crud._syncYEvent() → block._applyDeltaToView(delta)  // 增量更新 Blot 树
      → selectionManager 恢复光标
```

#### 4.9.2 IME 输入法（Composition）处理

IME 输入是最复杂的输入场景，因为浏览器在合成期间直接修改 DOM，不经过 `beforeInput`。

**CompositionSession 生命周期：**
```
idle ──compositionStart──► active ──compositionEnd──► committing ──► idle
                             │                           │
                             └── (远程 delta) ────► 缓存 (deferPatch)
```

**各阶段处理：**

| 阶段 | 事件 | 处理 |
|------|------|------|
| `compositionStart` | 浏览器开始 IME 合成 | 创建 `CompositionSession`，捕获 `OneShotCursorAnchor`（Yjs RelativePosition） |
| `active` | 浏览器修改 DOM（下划线候选文字） | 不干预浏览器 DOM 操作；远程 delta 到达时缓存而不应用 |
| `compositionEnd` | 用户确认候选词 | `preventDefault`，将最终文本写入 Y.Text（ORIGIN_SKIP_SYNC），调用 `rerender()` 全量重建 |
| `committing` | rerender + 光标恢复 | **同步**设置光标（不用 microtask），排空缓存的远程 patches（不重放） |

**关键设计决策：**

1. **`ORIGIN_SKIP_SYNC`**: compositionEnd 的 Y.Text 事务使用此 origin，跳过 Y.Event → applyDeltaToView 路径。因为紧接着会调用 `rerender()` 从完整 Y.Text 重建视图。

2. **同步光标恢复**: compositionEnd 后必须在同一个事务中 `rerender()` + `setInlineRange()`。如果用 `queueMicrotask` 延迟，会有一个间隙让 `selectionchange` 事件触发 `recalculate()`，此时 `isComposing` 已经是 false 但 DOM 还没有有效选区，导致光标跳到位置 0。

3. **缓存排空不重放**: `drainDeferredPatches()` 只清空缓存，不重放 delta。因为 `rerender()` 从完整 Y.Text 模型重建，已经包含了所有远程变更。重放会导致双重应用。

#### 4.9.3 OneShotCursorAnchor — 协同安全锚点

```typescript
class OneShotCursorAnchor {
  capture(block, index)   // Y.createRelativePositionFromTypeIndex
  resolve(fallback?)      // Y.createAbsolutePositionFromRelativePosition
  reset()                 // 清除锚点
}
```

使用 Yjs `RelativePosition`：即使远程用户在锚点之前插入/删除文本，锚点仍然指向逻辑上正确的位置。用于：
- IME 合成期间追踪插入点
- MentionPlugin 追踪 `@` 字符位置

### 4.10 EmbedBlot 格式化语义

`format()` 方法使用**合并语义**（与 TextBlot 一致）：

```typescript
format(attrs: IInlineNodeAttrs) {
  const merged = { ...this.attrs }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) delete merged[k]  // 删除属性
    else merged[k] = v                                    // 设置/更新属性
  }
  this.attrs = Object.keys(merged).length ? merged : undefined
  setAttributes(this.cElement, attrs)
}
```

这确保对 EmbedBlot 应用格式化（如加粗）时，不会丢失已有的 `mentionId`、`mentionType` 等元数据属性。

### 4.11 数据流总览（行内编辑）

```
本地输入:
  beforeInput → preventDefault → yText.insert/delete/format
    → Y.Event → crud._syncYEvent → onTextUpdate$
    → block._applyDeltaToView(delta)
    → scrollBlot.applyDelta(ops)  → DOM 增量更新
    → _verifyBlotConsistency() → 不一致则 rerender()

IME 输入:
  compositionStart → session.start()
  compositionEnd → preventDefault → yText.insert (ORIGIN_SKIP_SYNC)
    → block.rerender() → scrollBlot.build(deltas) → DOM 全量重建
    → block.setInlineRange() → 同步恢复光标
    → session.drainDeferredPatches() → 排空不重放

远程协同:
  Yjs sync → Y.Event → crud._syncYEvent → onTextUpdate$
    → if (compositionSession.shouldDeferPatch(blockId))
        → session.deferPatch() → 缓存等待
    → else
        → block._applyDeltaToView(delta) → 增量更新
```

---

## 五、事件系统

### 5.1 UIEventDispatcher

事件分发器，支持三级作用域：

```
Block 级别 → Flavour 级别 → 全局级别
```

**事件类型：**
- 输入：`beforeInput`, `compositionStart/Update/End`
- 鼠标：`click`, `doubleClick`, `tripleClick`, `mouseDown/Move/Up`
- 键盘：`keyDown`, `keyUp`
- 拖拽：`dragStart/Enter/Move/Leave/End`, `drop`
- 剪贴板：`cut`, `copy`, `paste`
- 选区：`selectionChange`, `selectStart/End`
- 焦点：`focusIn`, `focusOut`

### 5.2 事件上下文

```typescript
class UIEventStateContext {
  get<T>(type: string): T          // 获取特定事件状态
  preventDefault(): void
  stopPropagation(): void
}

// 事件状态类型
KeyboardEventState { raw: KeyboardEvent }
ClipboardEventState { raw: ClipboardEvent }
PointerEventState   { raw: PointerEvent, point: {x, y} }
EventSourceState    { from: BlockComponent, event: Event }
```

### 5.3 装饰器绑定

```typescript
// 事件监听
@EventListen('keyDown', { flavour: 'code' })
handleCodeKeyDown(ctx: UIEventStateContext) { }

// 快捷键绑定
@BindHotKey({ key: 'b', shortKey: true })
handleBold(ctx: UIEventStateContext) { }
```

---

## 六、选区管理（Selection）

### 6.1 选区类型

```typescript
// 文本选区（在可编辑块内）
type TextRange = {
  blockId: string
  block: EditableBlockComponent
  type: 'text'
  index: number      // 字符偏移
  length: number     // 选中长度
}

// 块选区（选中整个块）
type SelectedRange = {
  blockId: string
  block: BlockComponent
  type: 'selected'
}

// 完整选区
interface BlockSelection {
  from: TextRange | SelectedRange
  to: TextRange | SelectedRange | null
  collapsed: boolean
  isAllSelected: boolean
  commonParent: string
  raw: Range
}
```

### 6.2 关键方法

```typescript
setSelection(from, to?)           // 设置选区
setCursorAt(block, index)         // 设置光标
selectBlock(block)                // 选中整个块
normalizeRange(range)             // 标准化 DOM Range 为 BlockSelection
recalculate()                     // 重新计算当前选区
scrollSelectionIntoView()         // 滚动到选区可见
```

---

## 七、CRUD 操作

### 7.1 DocCRUD

所有块操作都通过 `doc.crud` 执行，内部包装为 Yjs 事务：

```typescript
// 插入
insertBlocks(parentId, index, snapshots)
insertBlocksBefore(block, snapshots)
insertBlocksAfter(block, snapshots)

// 删除
deleteBlocks(parent, index, count)
deleteBlockById(blockId)

// 替换
replaceWithSnapshots(blockId, snapshots)

// 移动
moveBlocks(parentId, index, count, targetId, targetIndex)

// 导航
nextSibling(block): BlockComponent | null
prevSibling(block): BlockComponent | null
queryAncestor(block, predicate): BlockComponent[]
```

### 7.2 Yjs 同步机制

```
JS 属性修改 → Proxy 拦截 → Y.Map.set()
                                ↓
                          Y.Event 触发
                                ↓
                    DocCRUD._syncYEvent()
                                ↓
              ┌─────────────────┼─────────────────┐
              ↓                 ↓                 ↓
      onChildrenUpdate$   onPropsUpdate$    onTextUpdate$
              ↓                 ↓                 ↓
      VM 增删组件        组件属性更新        行内内容更新
              ↓                 ↓                 ↓
      Angular CD         markForCheck()     rerender()
```

---

## 八、插件系统

### 8.1 DocPlugin 基类

```typescript
abstract class DocPlugin {
  name: string
  version: number
  protected doc: BlockCraft.Doc

  register(doc: BlockCraft.Doc): void   // 框架调用
  abstract init(): void                  // 初始化
  abstract destroy(): void               // 销毁
}
```

### 8.2 插件生命周期

```
1. 传入 DocConfig.plugins[]
2. Doc 初始化完成后 → plugin.register(doc)
3. register() 内部：
   - 保存 doc 引用
   - 扫描 @EventListen / @BindHotKey 装饰器
   - 自动注册事件处理器
   - 调用 init()
4. Doc 销毁时 → plugin.destroy()
```

### 8.3 已有插件清单

| 插件 | 职责 |
|------|------|
| `BlockTransformerPlugin` | Markdown 快捷键（`# ` → 标题，`- ` → 列表等） |
| `FloatTextToolbarPlugin` | 选中文本时的浮动工具栏 |
| `BlockControllerPlugin` | 块拖拽手柄、右键菜单 |
| `CodeInlineEditorBinding` | 代码块特殊按键（Tab、Enter） |
| `TableBlockBinding` | 表格块交互（Tab 切换单元格等） |
| `ImgToolbarPlugin` | 图片编辑工具栏 |
| `CalloutToolbarPlugin` | Callout 样式工具栏 |
| `AttachmentExtensionPlugin` | 附件处理 |
| `EmbedFrameExtensionPlugin` | iframe 嵌入管理 |
| `BookmarkBlockExtensionPlugin` | 书签块工具栏 |
| `InlineLinkExtension` | 链接编辑和预览 |
| `MentionPlugin` | @提及：纯执行流引擎（触发、关键词、键盘转发、确认提交），UI 完全由 `MentionPanelFactory` 注入 |
| `DividerExtensionPlugin` | 分割线样式 |
| `FindReplacePlugin` | 查找替换（Ctrl+F） |
| `DemoPresentationPlugin` | 演示模式 |
| `OrderedBlockPlugin` | 有序列表编号管理 |
| `TextMarkerPlugin` | 文本标记/高亮 |

---

## 九、适配器系统（Adapters）— 算法原理详解

### 9.1 总体架构

适配器系统负责 **外部格式（HTML/Markdown）** 与 **内部 BlockSnapshot** 之间的双向转换。

```
┌──────────────────────────────────────────────────────────────────┐
│                        Adapter System                            │
│                                                                  │
│  ┌─────────────┐    toBlockSnapshot     ┌──────────────────┐    │
│  │  HTML String │ ──────────────────────→│                  │    │
│  │  (rehype)    │                        │   BlockSnapshot   │    │
│  │  Markdown    │ ←─────────────────────│   (内部格式)      │    │
│  │  (remark)    │    fromBlockSnapshot   │                  │    │
│  └─────────────┘                        └──────────────────┘    │
│         ↕                                       ↕                │
│  ┌─────────────┐                        ┌──────────────────┐    │
│  │  AST (HAST/  │   ← ASTWalker →      │  ASTWalkerContext │    │
│  │   MDAST)     │                        │  (栈 + 上下文)    │    │
│  └─────────────┘                        └──────────────────┘    │
│         ↕                                                        │
│  ┌─────────────┐                        ┌──────────────────┐    │
│  │ BlockMatcher │   ← 匹配 + 转换 →    │  DeltaConverter   │    │
│  │ (块级转换)   │                        │  (行内转换)       │    │
│  └─────────────┘                        └──────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 核心数据结构

#### 9.2.1 NodeProps — 遍历上下文节点

```typescript
type NodeProps<Node> = {
  node: Node              // 当前节点
  next: Node | null       // 同级下一个兄弟节点
  parent: NodeProps<Node> | null  // 父节点（递归结构，可向上追溯）
  prop: keyof Node | null // 当前节点在父节点中的属性名
  index: number | null    // 当前节点在数组中的索引（非数组子节点为 null）
}
```

`NodeProps` 是遍历过程中每个节点的"定位信息"，通过它可以：
- 访问当前节点 `node`
- 查看下一个兄弟 `next`（用于判断是否需要合并/关闭容器）
- 向上追溯父链 `parent.parent.parent...`
- 知道自己在父节点中的位置 `prop` + `index`

#### 9.2.2 ASTWalkerContext — 目标树构建栈

```typescript
class ASTWalkerContext<TNode> {
  _stack: { node: TNode, prop: keyof TNode, context: Record<string, unknown> }[]

  openNode(node, parentProp?)   // 压栈：开始构建一个新节点
  closeNode()                   // 出栈：完成节点，挂到父节点的 children 上
  currentNode()                 // 栈顶节点
  previousNode()                // 栈顶第二个节点（父节点）

  // 全局上下文（跨节点共享状态）
  setGlobalContext(key, value)
  getGlobalContext(key)
  pushGlobalContextStack(key, value)

  // 节点上下文（当前节点私有状态）
  setNodeContext(key, value)
  getNodeContext(key)

  // 跳过控制
  skipAllChildren()             // 跳过当前节点的所有子节点
  skipChildren(num)             // 跳过前 N 个子节点
}
```

**栈操作图解：**
```
遍历 <ul><li>A</li><li>B</li></ul> → BlockSnapshot

步骤 1: enter <ul>
  栈: [root]                    ← 不做操作，ul 不直接映射

步骤 2: enter <li>A
  openNode(bullet{text:"A"})
  栈: [root, bullet-A]
  closeNode() → bullet-A 挂到 root.children
  栈: [root]                    ← root.children = [bullet-A]

步骤 3: enter <li>B
  openNode(bullet{text:"B"})
  closeNode() → bullet-B 挂到 root.children
  栈: [root]                    ← root.children = [bullet-A, bullet-B]
```

### 9.3 ASTWalker — 深度优先遍历算法

```typescript
class ASTWalker<ONode, TNode> {
  _enter: (o: NodeProps<ONode>, ctx: ASTWalkerContext<TNode>) => void
  _leave: (o: NodeProps<ONode>, ctx: ASTWalkerContext<TNode>) => void
  _isONode: (node: unknown) => node is ONode  // 类型守卫

  walk(oNode, tNode):
    1. openNode(tNode)          // 将目标根节点压栈
    2. _visit(oNode)            // 开始深度优先遍历
    3. 断言栈只剩 1 个元素      // 确保所有节点都已关闭
    4. return currentNode()     // 返回构建好的目标树
}
```

**`_visit` 核心遍历逻辑：**

```
_visit(o: NodeProps<ONode>):
  ① 重置 skip 状态
  ② 调用 _enter(o, context)
  ③ 如果被 skip，直接返回
  ④ 遍历 o.node 的所有属性 key:
     ├── 如果 value 是数组:
     │     for i = skipChildrenNum; i < value.length; i++:
     │       如果 value[i] 是 ONode:
     │         nextItem = value[i+1] ?? null    ← 同数组内的下一个兄弟
     │         递归 _visit({ node: value[i], next: nextItem, parent: o, prop: key, index: i })
     │
     └── 如果 value 是单个对象且是 ONode:
           递归 _visit({ node: value, next: null, parent: o, prop: key, index: null })
  ⑤ 调用 _leave(o, context)
```

**关键特性：**
- 遍历源树（ONode），同时通过 context 栈构建目标树（TNode）
- `next` 字段提供同级兄弟信息，用于判断是否需要关闭容器节点
- `skipAllChildren()` 用于叶节点优化（如 `<p>` 的行内内容直接转 delta，不再遍历子节点）
- `skipChildren(n)` 用于跳过已处理的前 N 个子节点

### 9.4 双向转换流程

#### 9.4.1 HTML → BlockSnapshot（toBlockSnapshot）

```
HTML 字符串
  ↓ rehype-parse
HAST (HTML AST)
  ↓ ASTWalker<HtmlAST, IBlockSnapshot>
  │
  │  对每个 HAST 节点:
  │    1. 遍历所有 BlockMatcher，找到 toMatch(o) === true 的
  │    2. 调用 matcher.toBlockSnapshot.enter(o, context)
  │       ├── 创建 BlockSnapshot 节点
  │       ├── 用 DeltaConverter.astToDelta() 转换行内内容
  │       ├── context.openNode() / closeNode() 构建树
  │       └── 可选 skipAllChildren() 跳过子节点
  │    3. 递归遍历子节点
  │    4. 调用 matcher.toBlockSnapshot.leave(o, context)
  │       └── 关闭未关闭的节点
  ↓
BlockSnapshot 树
```

**具体示例 — HTML 段落转换：**
```
输入: <p>Hello <strong>world</strong></p>

HAST:
  Element { tagName: 'p', children: [
    Text { value: 'Hello ' },
    Element { tagName: 'strong', children: [
      Text { value: 'world' }
    ]}
  ]}

匹配: paragraphBlockHtmlAdapterMatcher.toMatch() → true (tagName === 'p')

enter():
  1. deltaConverter.astToDelta(p) → [
       { insert: 'Hello ' },
       { insert: 'world', attributes: { 'a:bold': true } }
     ]
  2. context.openNode({
       flavour: 'paragraph',
       children: [上述 delta 数组],
       ...
     })
  3. context.closeNode()
  4. skipAllChildren()  ← 行内内容已处理，不再遍历 <strong> 等子节点

输出: IBlockSnapshot {
  flavour: 'paragraph',
  nodeType: 'editable',
  children: [
    { insert: 'Hello ' },
    { insert: 'world', attributes: { 'a:bold': true } }
  ]
}
```

#### 9.4.2 BlockSnapshot → HTML（fromBlockSnapshot）

```
BlockSnapshot 树
  ↓ ASTWalker<IBlockSnapshot, HtmlAST>
  │
  │  对每个 BlockSnapshot 节点:
  │    1. 遍历所有 BlockMatcher，找到 fromMatch(o) === true 的
  │    2. 调用 matcher.fromBlockSnapshot.enter(o, context)
  │       ├── 创建 HAST 节点
  │       ├── 用 DeltaConverter.deltaToAST() 转换行内内容
  │       └── context.openNode() / closeNode()
  │    3. 递归遍历子块
  │    4. 调用 matcher.fromBlockSnapshot.leave(o, context)
  ↓
HAST
  ↓ rehype-stringify
HTML 字符串
```

#### 9.4.3 Markdown 转换

与 HTML 流程相同，区别在于：
- 使用 `remark-parse` / `remark-stringify` 解析/序列化
- AST 类型为 MDAST（`paragraph`, `heading`, `listItem`, `code` 等）
- 支持 GFM 扩展（删除线、表格、任务列表、自动链接）

### 9.5 DeltaConverter — 行内内容转换

行内内容（文本 + 格式）在 BlockSnapshot 中以 `DeltaInsert[]` 表示，需要与 AST 行内节点互转。

#### 9.5.1 AST → Delta（astToDelta）

```
HAST 行内节点                          DeltaInsert[]
─────────────                          ──────────────
Text("Hello ")                    →    { insert: "Hello " }
<strong>world</strong>            →    { insert: "world", attributes: { "a:bold": true } }
<a href="url">link</a>           →    { insert: "link", attributes: { "a:link": "url" } }
<code>code</code>                 →    { insert: "code", attributes: { "a:code": true } }
<em><strong>both</strong></em>    →    { insert: "both", attributes: { "a:bold": true, "a:italic": true } }
```

**算法：** 递归遍历行内 AST，每遇到格式节点就累积 attributes，到达文本节点时生成 DeltaInsert。相邻且 attributes 相同的 delta 会被 `mergeDeltas()` 合并。

#### 9.5.2 Delta → AST（deltaToAST）

```
DeltaInsert[]                          HAST 行内节点
──────────────                          ─────────────
{ insert: "plain" }               →    Text("plain")
{ insert: "bold", attrs: {bold} } →    <strong>bold</strong>
{ insert: "link", attrs: {link} } →    <a href="url">link</a>
{ insert: "both", attrs:          →    <em><strong>both</strong></em>
    {bold, italic} }
```

**算法：** 遍历每个 DeltaInsert，按 `InlineDeltaMatcher` 优先级依次包裹格式节点。多个属性时从外到内嵌套。

### 9.6 BlockMatcher 详解

每个 BlockMatcher 负责一种块类型的双向转换：

| Matcher | toMatch (AST→Block) | fromMatch (Block→AST) |
|---------|---------------------|----------------------|
| paragraph | `<p>`, `<h1-6>`, `<blockquote>`, `<div>`, `<span>` | `paragraph`, `blockquote` |
| code | `<pre>` / mdast `code` | `code` |
| list | `<ul>`, `<ol>`, `<li>` / mdast `listItem` | `bullet`, `ordered`, `todo` |
| table | `<table>` | `table` |
| tableRow | `<tr>` | `table-row` |
| tableCell | `<td>`, `<th>` | `table-cell` |
| image | `<img>` / mdast `image` | `image` |
| divider | `<hr>` / mdast `thematicBreak` | `divider` |
| embed | 通用兜底 | 通用兜底 |

#### 9.6.1 列表转换的 `next` 节点用法

列表转换是 `next` 字段最关键的使用场景。在 `fromBlockSnapshot`（Block→AST）方向：

```typescript
// markdown list-matcher leave 阶段
if (!o.next || !listBlockFlavour.includes(o.next.flavour) ||
    o.next.flavour !== o.node.flavour) {
  // 下一个节点不是同类型列表 → 关闭 <ul>/<ol> 容器
  walkerContext.closeNode();
}
```

在 `toBlockSnapshot`（AST→Block）方向，HTML list-matcher 利用 `next` 传递深度信息：

```typescript
// 当前 <li> 处理完后，将 depth 信息传递给下一个 <li>
if (o.next && HastUtils.isElement(o.next) && o.next.tagName === 'li') {
  o.next.properties['bc:depth'] = depth;
}
```

### 9.7 `next` 节点的局限性与改造

#### 9.7.1 原有问题

在原始实现中，`next` 只在数组遍历时被设置：

```typescript
// ast-walker.ts _visit 方法中
if (Array.isArray(value)) {
  for (let i = ...; i < value.length; i++) {
    const nextItem = value[i + 1] ?? null;  // ← 只有数组内才有 next
    await this._visit({ node: item, next: nextItem, ... });
  }
} else if (this._isONode(value)) {
  await this._visit({ node: value, next: null, ... });  // ← 单对象永远 null
}
```

**问题：**
- 单对象属性的子节点 `next` 永远为 `null`
- `walk()` 入口调用 `_visit({ node: oNode, next: undefined, ... })`，根节点没有 `next`
- 当节点来自不同属性时（如 `node.header` 和 `node.body`），无法知道跨属性的下一个节点

#### 9.7.2 改造方案

改造后，walker 会预先收集当前节点的所有可遍历子节点，统一计算 `next`：

```
改造前:
  for key in node:
    if array → 遍历数组，next = array[i+1]
    if object → 遍历单个，next = null

改造后:
  1. 先收集所有子节点到 flatChildren 列表
  2. 统一遍历 flatChildren，next = flatChildren[i+1]
  → 无论来自数组还是单对象，都能正确获取 next
```

---

## 十、撤销/重做

基于 Yjs UndoManager：

```typescript
class DocUndoManger {
  undo(): void
  redo(): void
  isCanUndo(): boolean
  isCanRedo(): boolean
  clearHistory(): void
}
```

**选区追踪：** 每次可撤销操作前捕获选区状态，撤销/重做后恢复。

**Origin 系统：**
- `ORIGIN_SKIP_SYNC`: 跳过 Y.Event 同步到模型
- `ORIGIN_NO_RECORD`: 不记录到撤销栈

---

## 十一、数据流总览

```
用户输入
  ↓
UIEventDispatcher (事件分发)
  ↓
事件处理器 (InputTransformer / Plugin / Hotkey)
  ↓
SelectionManager (选区计算)
  ↓
DocCRUD (Yjs 事务)
  ↓
Y.Events (observeDeep)
  ↓
_syncYEvent (同步到组件模型)
  ↓
Change Events (onChildrenUpdate$ / onPropsUpdate$ / onTextUpdate$)
  ↓
View Update (Angular Change Detection)
  ↓
UndoManager (撤销栈更新)
```

---

## 十二、性能优化模式

| 模式 | 应用场景 |
|------|---------|
| `ChangeDetectionStrategy.OnPush` | 所有 Block 组件 |
| `debounce` | 代码高亮（200ms）、Mermaid 预览（500ms） |
| `throttleTime` | 鼠标拖拽（26-32ms） |
| `ngZone.runOutsideAngular` | 拖拽、resize 等高频操作 |
| `IntersectionObserver` | Mermaid 懒渲染 |
| `ResizeObserver` | 表格行高追踪 |
| 增量 Blot patch | `ScrollBlot.applyDelta()` 增量修补 + 一致性校验回退 |
| Delta 缓存 + 前后缀收缩 | 代码高亮差分更新 |
