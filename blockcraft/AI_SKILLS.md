# BlockCraft AI Skills

> 本文件供 AI 助手（如 Claude、Cursor 等）在协助开发 BlockCraft 时参考。
> 包含创建插件、Block、优化架构的通用技能和模板。

---

## Skill 1: 创建新的 Block 类型

### 步骤

1. 在 `blocks/` 下创建目录 `{name}-block/`
2. 创建 `index.ts`（Model + Schema）
3. 创建 `{name}.block.ts`（Component）
4. 在 `blocks/index.ts` 中导出
5. 在 EditorComponent 的 schemas 中注册

### 模板：可编辑块（Editable Block）

**index.ts:**
```typescript
import { BlockNodeType, EditableBlockNative, editableBlockCreateSnapShotFn } from "../../framework";
import { MyBlockComponent } from "./my.block";

export interface MyBlockModel extends EditableBlockNative {
  flavour: 'my-block'
  props: {
    customProp?: string
  }
}

export const MyBlockSchema = {
  flavour: 'my-block',
  nodeType: BlockNodeType.editable,
  component: MyBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn,
  metadata: {
    version: 1,
    label: '自定义块',
    isLeaf: true,
    renderUnit: true,
    includeChildren: ['root'],  // 允许放在哪些父块下
  }
}
```

**my.block.ts:**
```typescript
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { EditableBlockComponent } from "../../framework";
import { MyBlockModel } from "./index";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

@Component({
  selector: 'div.my-block',
  template: `
    <div class="my-block__prefix" contenteditable="false">
      <!-- 不可编辑的前缀区域 -->
    </div>
    <pre class="edit-container"></pre>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBlockComponent extends EditableBlockComponent<MyBlockModel> {

  override ngAfterViewInit() {
    super.ngAfterViewInit()

    // 监听属性变化
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changedKeys => {
      if (changedKeys.has('customProp')) {
        // 处理属性变化
      }
      this.changeDetectorRef.markForCheck()
    })

    // 监听文本变化
    this.onTextChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      // e.op: DeltaOperation[]
    })
  }
}
```

### 模板：容器块（Block Node）

```typescript
// index.ts
export const ContainerBlockSchema = {
  flavour: 'my-container',
  nodeType: BlockNodeType.block,
  component: ContainerBlockComponent,
  createSnapshot: (args) => ({
    ...args,
    flavour: 'my-container',
    nodeType: BlockNodeType.block,
    children: [],
  }),
  metadata: {
    version: 1,
    label: '容器块',
    isLeaf: false,
    includeChildren: ['root'],
  }
}

// component: 使用 <children-render-container> 渲染子块
```

### 模板：空块（Void Block）

```typescript
export const VoidBlockSchema = {
  flavour: 'my-void',
  nodeType: BlockNodeType.void,
  component: VoidBlockComponent,
  createSnapshot: (args) => ({
    ...args,
    flavour: 'my-void',
    nodeType: BlockNodeType.void,
    children: [],
  }),
  metadata: {
    version: 1,
    label: '空块',
    isLeaf: true,
  }
}
```

---

## Skill 2: 创建新的 Plugin

### 步骤

1. 在 `plugins/` 下创建文件
2. 继承 `DocPlugin`
3. 使用装饰器绑定事件
4. 在 EditorComponent 的 plugins 中注册

### 模板

```typescript
import { DocPlugin, EventListen, BindHotKey, UIEventStateContext } from "../../framework";

export class MyPlugin extends DocPlugin {
  name = 'my-plugin'
  version = 1.0

  init() {
    // 初始化逻辑
    // 可以访问 this.doc
  }

  destroy() {
    // 清理逻辑
  }

  // 监听特定块类型的事件
  @EventListen('keyDown', { flavour: 'paragraph' })
  onParagraphKeyDown(ctx: UIEventStateContext) {
    const keyState = ctx.get<KeyboardEventState>('keyboardState')
    if (keyState.raw.key === 'Enter') {
      ctx.preventDefault()
      // 自定义 Enter 行为
    }
  }

  // 全局快捷键
  @BindHotKey({ key: 'k', shortKey: true })
  onCtrlK(ctx: UIEventStateContext) {
    ctx.preventDefault()
    // Ctrl+K 行为
  }

  // 监听所有块的事件
  @EventListen('click')
  onClick(ctx: UIEventStateContext) {
    const source = ctx.get<EventSourceState>('sourceState')
    // source.from: 触发事件的 BlockComponent
  }
}
```

### 常用 Plugin 模式

**浮动工具栏插件：**
```typescript
@EventListen('selectionChange')
onSelectionChange(ctx: UIEventStateContext) {
  const sel = this.doc.selection.value
  if (sel?.from.type === 'text' && !sel.collapsed) {
    // 显示工具栏
    this.doc.overlayService.createConnectedOverlay({
      target: sel.raw.getBoundingClientRect(),
      component: MyToolbarComponent,
      positions: [getPositionWithOffset('top-center')],
    })
  }
}
```

**块转换插件：**
```typescript
@EventListen('beforeInput', { flavour: 'paragraph' })
onBeforeInput(ctx: UIEventStateContext) {
  const block = ctx.get<EventSourceState>('sourceState').from as EditableBlockComponent
  const text = block.textContent()
  if (text === '---') {
    // 转换为分割线
    this.doc.crud.replaceWithSnapshots(block.id, [dividerSnapshot])
  }
}
```

---

## Skill 3: 自定义 InlineManager

### 何时需要

- 需要自定义语法高亮（如代码块）
- 需要特殊的行内渲染逻辑
- 需要差分更新优化

### 模板

```typescript
import { InlineManager, DeltaInsertText, EditableBlockComponent } from "../../framework";

export class CustomInlineManager extends InlineManager {

  private _cachedDeltas: DeltaInsertText[] | null = null

  constructor(doc: BlockCraft.Doc, private block: EditableBlockComponent) {
    super(doc)
  }

  // 自定义 tokenize 逻辑
  private tokenize(text: string): DeltaInsertText[] {
    // 返回带样式的 delta 列表
    return [{ insert: text }]
  }

  // 差分高亮
  async diffHighLight(ops: DeltaOperation[]) {
    const text = this.block.textContent()
    const newDeltas = this.tokenize(text)

    if (!this._cachedDeltas) {
      this.render(newDeltas, this.block.containerElement)
    } else {
      const diffOps = this.computeDiff(this._cachedDeltas, newDeltas)
      if (diffOps.length > 0) {
        this.applyDeltaToView(diffOps, this.block.containerElement)
      }
    }
    this._cachedDeltas = newDeltas
  }

  // 全量渲染
  renderAll() {
    const text = this.block.textContent()
    const deltas = this.tokenize(text)
    this.render(deltas, this.block.containerElement)
    this._cachedDeltas = deltas
  }
}
```

### 关键原则

1. **优先使用 `applyDeltaToView`** 而非 `render` — 增量更新远快于全量替换
2. **缓存上次结果** — 用于计算差分
3. **保存/恢复光标** — 高亮后恢复 `block.setInlineRange(pos)`
4. **debounce** — 避免每次按键都触发高亮

---

## Skill 4: 使用 DocCRUD 操作块

### 常用操作

```typescript
const doc = this.doc

// 在指定位置插入块
doc.crud.insertBlocks(parentId, index, [snapshot])

// 在某块之后插入
doc.crud.insertBlocksAfter(block, [snapshot])

// 删除块
doc.crud.deleteBlockById(blockId)

// 替换块
doc.crud.replaceWithSnapshots(blockId, [newSnapshot])

// 移动块
doc.crud.moveBlocks(fromParentId, fromIndex, count, toParentId, toIndex)

// 导航
const next = doc.crud.nextSibling(block)
const prev = doc.crud.prevSibling(block)
const ancestors = doc.crud.queryAncestor(block, b => b.flavour === 'root')

// 事务（多个操作原子化）
doc.crud.transact(() => {
  doc.crud.deleteBlockById(id1)
  doc.crud.insertBlocks(parentId, 0, [snapshot])
})
```

---

## Skill 5: 选区操作

```typescript
const sel = doc.selection

// 设置光标
sel.setCursorAt(block, charIndex)

// 选中文本范围
sel.setSelection(
  { blockId: block.id, type: 'text', index: 0, length: 10 }
)

// 选中整个块
sel.selectBlock(block)

// 获取当前选区
const current = sel.value  // BlockSelection | null

// 监听选区变化
sel.selectionChange$.subscribe(selection => { })

// 标准化 DOM Range
const normalized = sel.normalizeRange(document.getSelection().getRangeAt(0))
```

---

## Skill 6: 创建 Adapter（格式转换）

### 模板

```typescript
import { ASTWalker } from "../../framework";

class MyFormatAdapter extends ASTWalker<MyAST, IBlockSnapshot> {
  blockMatchers = [
    paragraphMatcher,
    codeMatcher,
    // ...
  ]

  async toBlockSnapshot(source: string): Promise<IBlockSnapshot> {
    const ast = parse(source)
    return this.walk(ast)
  }

  async fromBlockSnapshot(snapshot: IBlockSnapshot): Promise<string> {
    return this.walkReverse(snapshot)
  }
}

// Block Matcher
const paragraphMatcher = {
  toMatch: (node) => node.type === 'paragraph',
  fromMatch: (snapshot) => snapshot.flavour === 'paragraph',
  toBlockSnapshot: {
    enter(node, ctx) { /* 转换逻辑 */ },
    leave(node, ctx) { }
  },
  fromBlockSnapshot: {
    enter(snapshot, ctx) { /* 反向转换 */ },
    leave(snapshot, ctx) { }
  }
}
```

---

## Skill 7: 性能优化检查清单

### 渲染性能
- [ ] 使用 `ChangeDetectionStrategy.OnPush`
- [ ] 高频操作使用 `ngZone.runOutsideAngular`
- [ ] 拖拽/resize 使用 `throttleTime(26-32ms)`
- [ ] 文本高亮使用 `debounce(200ms)`
- [ ] 使用 `applyDeltaToView` 替代 `render` 做增量更新
- [ ] 缓存 tokenize 结果，避免重复计算

### 内存管理
- [ ] 使用 `takeUntilDestroyed(this.destroyRef)` 管理订阅
- [ ] `ngOnDestroy` 中清理定时器和事件监听
- [ ] 大列表使用 `IntersectionObserver` 懒渲染

### DOM 操作
- [ ] 避免在 Angular Zone 内做大量 DOM 操作
- [ ] 使用 `ResizeObserver` 替代轮询检测尺寸变化
- [ ] 批量 DOM 更新使用 `requestAnimationFrame`

---

## Skill 8: 调试技巧

```typescript
// 查看块树结构
const root = doc.vm.rootComponent
console.log(root.toSnapshot(true))

// 查看当前选区
console.log(doc.selection.value)

// 查看块的行内内容
const block = doc.vm.getComponent(blockId) as EditableBlockComponent
console.log(block.textContent())

// 查看 Yjs 文档状态
console.log(doc.yDoc.toJSON())

// 性能监控
import { performanceTest } from "../../global"
@performanceTest
myMethod() { }
```

---

## Skill 9: 常见架构模式

### Overlay 浮层

```typescript
const close$ = new Subject()
const { componentRef } = doc.overlayService.createConnectedOverlay({
  target: element,
  component: MyOverlayComponent,
  positions: [getPositionWithOffset('bottom-center')],
  backdrop: true,
}, close$)

componentRef.setInput('data', myData)
componentRef.instance.action.subscribe(() => close$.next(true))
```

### 块间通信

```typescript
// 通过 doc.crud 事件
doc.crud.onPropsUpdate$.subscribe(event => {
  if (event.blockId === targetId) { }
})

// 通过父子关系
const parent = doc.crud.queryAncestor(block, b => b.flavour === 'table')[0]
const children = parent.getChildrenBlocks()
```

### 拖拽模式

```typescript
onDragStart(evt: MouseEvent) {
  evt.preventDefault()
  doc.ngZone.runOutsideAngular(() => {
    const move$ = fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(throttleTime(32))
      .subscribe(e => { /* 更新位置 */ })

    fromEvent<MouseEvent>(document, 'mouseup', { capture: true })
      .pipe(take(1))
      .subscribe(() => {
        move$.unsubscribe()
        // 提交最终状态
      })
  })
}
```
