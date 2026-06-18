import { ChangeDetectionStrategy, Component, HostBinding } from "@angular/core";
import { BaseBlockComponent } from "./base-block";
import { EditableBlockNative } from "../../reactive";
import * as Y from 'yjs'
import { DeltaInsert, DeltaOperation } from "../../types";
import { INLINE_CONTAINER_CLASS, TextBlot, BlotType } from "../../inline";
import { InlineRuntime } from "../../inline/runtime/inline-runtime";
import { Subject } from "rxjs";

@Component({
  selector: 'editable-block',
  template: ``,
  styles: [``],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditableBlockComponent<Model extends EditableBlockNative = EditableBlockNative> extends BaseBlockComponent<Model> {
  plainTextOnly = false

  private _yText!: Y.Text
  get yText() {
    return this._yText ||= this.yBlock.get('children') as Y.Text
  }

  protected _runtime!: InlineRuntime

  /**
   * Per-block InlineRuntime: owns ScrollBlot tree + InlinePositionMapper.
   * Subclasses (e.g. CodeBlockComponent) can override runtime creation.
   */
  get runtime(): InlineRuntime {
    return this._runtime
  }

  onTextChange = new Subject<{ op: DeltaOperation[]; tr: Y.Transaction; }>();

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._containerElement = this.hostElement.classList.contains(INLINE_CONTAINER_CLASS) ? this.hostElement : this.hostElement.querySelector(`.${INLINE_CONTAINER_CLASS}`)!

    this._initRuntime()
    this.rerender()

    // WebKit/WKWebView (Tauri) 偶发会在聚焦空 contenteditable 时「深克隆」宿主元素，
    // 留下一个没有 Angular 组件、却带着相同 data-block-id 的孤儿 DOM 节点
    // （表现为同一个块出现两个 .xxx-block / .mermaid-textarea）。聚焦发生在创建之后，
    // 故下一帧再扫一次兜底清除；后续任意 rerender 也会清。
    requestAnimationFrame(() => this._pruneDuplicateHostClones())
  }

  /**
   * 移除本块宿主的孤儿克隆。WebKit 的 contenteditable 引擎有时会深克隆聚焦中的
   * 宿主元素，克隆体复制了 `data-block-id` 但没有 Angular 组件上下文（dead node）。
   * 每个块 id 在 DOM 里只允许有一个真实宿主——把同级里携带本块 id、又不是本宿主的
   * 节点删掉。纯本地 DOM 操作、O(同级数)，不触碰模型。
   */
  protected _pruneDuplicateHostClones() {
    const host = this.hostElement
    const id = this.id
    // 克隆体由浏览器复制节点产生，必然紧挨真实宿主（前或后），所以只向两侧相邻
    // 扫描：O(克隆数)（正常为 0，只多两次 getAttribute），不在 rerender 热路径做
    // 全量同级遍历。
    let prev = host.previousElementSibling
    while (prev && prev.getAttribute('data-block-id') === id) {
      const p = prev.previousElementSibling
      prev.remove()
      prev = p
    }
    let next = host.nextElementSibling
    while (next && next.getAttribute('data-block-id') === id) {
      const n = next.nextElementSibling
      next.remove()
      next = n
    }
  }

  /**
   * Initialize the InlineRuntime for this block.
   * Called once in ngAfterViewInit. Subclasses can override to use a custom runtime.
   */
  protected _initRuntime() {
    const embedConverters = new Map(this.doc.config.embeds || [])
    this._runtime = new InlineRuntime(this._containerElement, embedConverters)
  }

  override reattach() {
    super.reattach();
    this.rerender()
  }

  protected _containerElement!: HTMLElement

  get containerElement() {
    return this._containerElement
  }

  @HostBinding('style.text-align')
  get textAlign() {
    return this._native.props['textAlign']
  }

  @HostBinding('attr.data-heading')
  get heading() {
    return this.plainTextOnly ? undefined : this._native.props['heading']
  }

  get textLength() {
    return this.yText.length
  }

  override textContent() {
    return (this.yText.toDelta() as DeltaInsert[]).reduce((acc, cur) => {
      return acc + (typeof cur.insert === 'string' ? cur.insert : cur.insert['break'] ? '\n' : '')
    }, '')
  }

  textDeltas(): DeltaInsert[] {
    return this.yText.toDelta()
  }

  rerender() {
    this._runtime.render(this.textDeltas())
    // 任意一次 rerender 都顺手清掉 WebKit 留下的宿主克隆（首次输入即可自愈）。
    this._pruneDuplicateHostClones()
  }

  insertText(index: number, text: string, attributes?: DeltaInsert['attributes']) {
    if (!text) return
    this.yText.insert(index, text, attributes)
  }

  deleteText(index: number, length = this.textLength - index) {
    if (!length) return
    this.yText.delete(index, length)
  }

  replaceText(index: number, length: number, text?: string | null, attributes?: DeltaInsert['attributes']) {
    const delta: DeltaOperation[] = []
    index > 0 && delta.push({ retain: index })
    length > 0 && delta.push({ delete: length })
    text && delta.push({ insert: text, attributes })
    this.yText.applyDelta(delta)
  }

  formatText(index: number, length: number, attributes: DeltaInsert['attributes']) {
    this.yText.format(index, length, attributes as any)
  }

  applyDeltaOperations(delta: DeltaOperation[]) {
    this.yText.applyDelta(delta)
  }

  protected _applyDeltaToYText(deltas: DeltaOperation[]) {
    this.yText.applyDelta(deltas)
  }

  /**
   * Apply delta operations to the view via the blot tree (InlineRuntime).
   * Called by crud.ts when Y.Text changes arrive from remote or local transactions.
   *
   * 只读模式下同样要渲染：readonly 拦截的是「本地输入」，不是「远端/程序化
   * 更新」。早退会让只读协同查看者的视图冻结，且切回可编辑后 blot 树与
   * Y.Text 脱节，后续光标定位与写入全部错位。
   */
  protected _applyDeltaToView(deltas: DeltaOperation[]) {
    try {
      this._runtime.applyDelta(deltas)
      if (!this._verifyBlotConsistency()) {
        this._rerenderRestoringCursor(deltas)
      }
    } catch {
      this._rerenderRestoringCursor(deltas)
    }
  }

  /**
   * 兜底 rerender 会整体重建 DOM（replaceChildren），原生选区随之失效，
   * 本地正在打字时远端触发兜底会直接丢光标。若当前文本选区完全位于本块，
   * 先把端点 offset 经 delta 变换映射到新坐标，rerender 后恢复。
   * 只在兜底路径执行；applyDelta 命中的正常路径零开销。
   */
  private _rerenderRestoringCursor(deltas: DeltaOperation[]) {
    let restore: { index: number, length: number } | null = null
    try {
      const sel = this.doc.selection.value
      if (sel && sel.isInSameBlock
        && sel.start.type === 'text' && sel.end.type === 'text'
        && sel.start.blockId === this.id) {
        const max = this.textLength
        const start = Math.max(0, Math.min(transformIndexThroughDeltas(sel.start.offset, deltas), max))
        const end = Math.max(start, Math.min(transformIndexThroughDeltas(sel.end.offset, deltas), max))
        restore = { index: start, length: end - start }
      }
    } catch {
      // 选区读取/变换失败不阻碍兜底渲染本身
    }
    this.rerender()
    if (restore) {
      // 同步恢复是安全的：selectionchange 按规范异步排队派发（addRange 不会
      // 同步触发 recalculate）；IME 组合期间本块的远端 patch 走 deferPatch，
      // 不会进入本路径。与 compositionEnd 的 rerender + setInlineRange 同模式。
      this.setInlineRange(restore.index, restore.length)
    }
  }

  /**
   * Verify that the blot tree content matches the Yjs delta model.
   * Returns true if consistent, false if mismatch detected.
   *
   * Uses fast O(1) length comparison. Falls back to full text comparison
   * only when length matches but content might differ (rare edge case).
   */
  private _verifyBlotConsistency(): boolean {
    // Fast path: O(1) length comparison covers >99% of real mismatches
    if (this.yText.length !== this._runtime.scrollBlot.textLength) {
      return false
    }

    // Full path: compare text content to catch same-length divergences
    const deltas = this.yText.toDelta() as DeltaInsert[]
    const leaves = this._runtime.scrollBlot.leaves

    let expectedText = ''
    for (const d of deltas) {
      expectedText += typeof d.insert === 'string' ? d.insert : '\ufffc'
    }

    let actualText = ''
    for (const leaf of leaves) {
      if (leaf.type === BlotType.Text) {
        actualText += (leaf as TextBlot).text
      } else if (leaf.type === BlotType.Embed) {
        actualText += '\ufffc'
      }
    }

    return expectedText === actualText
  }

  setInlineRange(index: number, length = 0) {
    return this.doc.selection.setSelection({
      index,
      length,
      type: 'text',
      blockId: this.id
    })
  }

}

/**
 * 把旧文本坐标经 delta（retain/insert/delete 序列）变换到新坐标：
 * 光标前的远端插入右移、删除左移；恰好落在光标位置的插入不移动光标
 * （左 affinity，与本地输入直觉一致）。
 *
 * 不变量：oldPos 只统计「旧文本坐标的消耗量」——retain/delete 消耗旧坐标，
 * insert 不消耗（Quill delta 语义），因此 insert 分支【不能】推进 oldPos；
 * `index - oldPos` 恒等于光标前尚未处理的旧字符数，delete 分支据此截取
 * 与光标的重叠量。给 insert 加 oldPos += len 看似"对齐"实则破坏该不变量。
 */
function transformIndexThroughDeltas(index: number, deltas: DeltaOperation[]): number {
  let newIndex = index
  let oldPos = 0
  for (const d of deltas) {
    if (oldPos >= index) break
    if (d.retain) {
      oldPos += d.retain
    } else if (typeof d.delete === 'number') {
      newIndex -= Math.min(d.delete, index - oldPos)
      oldPos += d.delete
    } else if (d.insert) {
      newIndex += typeof d.insert === 'string' ? d.insert.length : 1
    }
  }
  return newIndex
}
