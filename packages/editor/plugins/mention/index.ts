import {
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  OneShotCursorAnchor,
  TextBlot,
  UIEventStateContext
} from "../../framework";
import {characterAtDelta, nextTick} from "../../global";
import {debounceTime, filter, fromEvent, merge, skip, Subject, take, takeUntil} from "rxjs";
import {DeltaInsert} from "../../framework/block-std/types";
import {IMentionPanel, MentionPluginConfig} from "./types";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

export {createDefaultMentionPanel} from "./widget/default-panel";
export type {DefaultMentionPanelConfig} from "./widget/default-panel";
export type {MentionPluginConfig, MentionConfirmContext, IMentionPanel, IMentionData, MentionType, IMentionResponse, MentionPanelFactory} from "./types";

/**
 * MentionPlugin — inline @-mention with collaboration-safe anchoring.
 *
 * The plugin is a pure execution-flow engine. It handles:
 * - Trigger detection → insert '@' into Y.Text
 * - Keyword extraction → push to panel via `onKeywordChange`
 * - Keyboard capture → forward to panel via `onKeydown`
 * - Confirm → replace @keyword with embed delta
 * - Lifecycle → open / close / scroll / readonly
 *
 * The plugin does NOT own any UI, search logic, or panel interaction details.
 * All of that lives in the panel implementation provided via `config.panel`.
 *
 * ## Usage
 * ```ts
 * import {MentionPlugin, createDefaultMentionPanel} from './plugins/mention'
 *
 * new MentionPlugin({
 *   panel: createDefaultMentionPanel({
 *     request: (keyword, type) => api.searchMentions(keyword, type),
 *   }),
 *   onMentionClick: (id, type) => router.navigate([type, id]),
 * })
 * ```
 */
export class MentionPlugin extends DocPlugin {
  override name = 'mention'

  private _close$ = new Subject<void>()
  private _isOpen = false
  private _config: MentionPluginConfig
  private _trigger: string

  constructor(config: MentionPluginConfig) {
    super()
    this._config = config
    this._trigger = config.trigger || '@'
  }

  init() {}

  // ─── Trigger Detection ───

  @EventListen('beforeInput', {flavour: 'root'})
  onBindingInput(ctx: UIEventStateContext) {
    const e = ctx.getDefaultEvent() as InputEvent

    if (this._isOpen) return
    if (e.data !== this._trigger || e.isComposing) return

    const curSel = this.doc.selection.value
    if (!this._isLiveTextCursor(curSel) || (curSel.firstBlock as EditableBlockComponent).plainTextOnly) return

    const startBlock = curSel.firstBlock as EditableBlockComponent
    const startOffset = curSel.start.offset
    // Only trigger after a space or at the beginning of the line
    if (startOffset > 0) {
      const prevChar = characterAtDelta(startBlock.textDeltas(), startOffset)
      if (prevChar !== ' ' && prevChar !== '\n') return
    }

    e.preventDefault()
    if (this.doc.readonlyManager?.isReadonly(startBlock) ?? this.doc.isReadonly) {
      e.preventDefault()
      return true
    }
    return this.openAt(startBlock, startOffset) || undefined
  }

  /**
   * Opens the existing mention flow at an explicit model position.
   * `replaceLength` lets command surfaces atomically replace their trigger
   * text (for example `/mention`) with the configured mention trigger.
   */
  openAt(
    block: EditableBlockComponent,
    index: number,
    replaceLength = 0,
  ): boolean {
    if (
      !this._isBlockAlive(block) ||
      block.plainTextOnly ||
      (this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly)
    ) return false

    if (this._isOpen) this._close$.next()
    const start = Math.max(0, Math.min(index, block.textLength))
    const length = Math.max(0, Math.min(replaceLength, block.textLength - start))
    this._isOpen = true
    block.applyDeltaOperations([
      ...(start ? [{retain: start}] : []),
      ...(length ? [{delete: length}] : []),
      {insert: this._trigger},
    ])
    this.doc.selection.setSelection({
      blockId: block.id,
      type: 'text',
      index: start + 1,
      length: 0,
    })

    try {
      this._openSession(block, start)
      return true
    } catch {
      this._isOpen = false
      return false
    }
  }

  // ─── Mention Click ───

  @EventListen('mouseDown', {flavour: 'root'})
  onMouseDown(ctx: UIEventStateContext) {
    this._close$.next()

    const e = ctx.getDefaultEvent() as MouseEvent
    if (e.button !== 0) return
    const target = e.target
    if (!(target instanceof HTMLSpanElement) || !target.getAttribute('data-mention-id')) return
    const id = target.getAttribute('data-mention-id')!
    const type = target.getAttribute('data-mention-type')!
    this._config.onMentionClick?.(id, type, e)
    return true
  }

  // ─── Core Session ───

  private _openSession(block: EditableBlockComponent, atIndex: number) {
    let index = atIndex
    const anchor = new OneShotCursorAnchor(this.doc)
    anchor.capture(block, index)

    const resolveAnchor = () => {
      const point = anchor.resolve({block, index})
      if (point) {
        block = point.block as EditableBlockComponent
        index = point.index
      }
      return {block, index}
    }

    // Get screen rect of the trigger character
    const getAtRect = (): DOMRect | null => {
      const {block: b, index: i} = resolveAnchor()
      return this._getCharRect(b, i)
    }

    const atRect = getAtRect()
    if (!atRect || (!atRect.width && !atRect.height)) {
      this._isOpen = false
      return
    }

    // ─ Create panel via factory ─
    const panel: IMentionPanel = this._config.panel({
      doc: this.doc,
      rect: atRect,
    })

    // ─ Keyword extraction ─
    const getKeyword = (): string | null => {
      const {block: b, index: i} = resolveAnchor()
      if (this._charAtModelIndex(b, i) !== this._trigger) return null

      const curSel = this.doc.selection.value
      if (!this._isLiveTextCursor(curSel) || curSel.firstBlock !== b) return null

      const cursorIndex = curSel.start.offset
      if (cursorIndex <= i) return null

      const keyword = this._textBetween(b, i + 1, cursorIndex)
      if (/\s/.test(keyword)) return null
      return keyword
    }

    const pushKeyword = () => {
      if (this.doc.event.status.isComposing) return
      const keyword = getKeyword()
      if (keyword === null) {
        this._close$.next()
        return
      }
      panel.onKeywordChange(keyword)
    }

    // ─ Keyboard capture: forward to panel ─
    const navKeys = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab']
    const tempBindings = [
      // Escape: offer to panel first, fall back to close
      this.doc.event.bindHotkey({key: 'Escape'}, ctx => {
        if (this.doc.event.status.isComposing) return
        ctx.preventDefault()
        const e = ctx.getDefaultEvent() as KeyboardEvent
        if (!panel.onKeydown(e)) {
          this._close$.next()
        }
        return true
      }, {blockId: block.id}),

      // Navigation keys: delegate entirely to panel
      ...navKeys.map(key =>
        this.doc.event.bindHotkey({key}, ctx => {
          if (this.doc.event.status.isComposing) return true
          const e = ctx.getDefaultEvent() as KeyboardEvent
          if (panel.onKeydown(e)) {
            ctx.preventDefault()
            return true
          }
          return false
        }, {blockId: block.id})
      ),
    ]

    const updatePosition = () => {
      const r = getAtRect()
      if (!r) {
        this._close$.next()
        return
      }
      panel.updatePosition(r)
    }

    // ─ Lifecycle: scroll → reposition ─
    if (this.doc.scrollContainer) {
      fromEvent(this.doc.scrollContainer, 'scroll')
        .pipe(takeUntil(this._close$))
        .subscribe(() => updatePosition())
    }

    // ─ Lifecycle: readonly or destroy → close ─
    merge(
      this.doc.readonlySwitch$.pipe(filter(v => v)),
      this.doc.onDestroy$
    ).pipe(takeUntil(this._close$))
      .subscribe(() => this._close$.next())

    // ─ Cleanup on close ─
    this._close$.pipe(take(1)).subscribe(() => {
      this._isOpen = false
      tempBindings.forEach(v => v())
      anchor.reset()
      panel.dispose()
    })

    // ─ Keyword stream ─

    // Initial push
    panel.onKeywordChange('')

    // Text change → reposition + push keyword
    block.onTextChange
      .pipe(debounceTime(300), takeUntil(this._close$))
      .subscribe(() => {
        updatePosition()
        pushKeyword()
      })

    // Selection change → close if cursor left @keyword range
    this.doc.selection.selectionChange$
      .pipe(skip(1), debounceTime(100), takeUntil(this._close$))
      .subscribe(() => {
        if (getKeyword() === null) this._close$.next()
      })

    // ─ Confirm: replace @keyword with embed ─
    panel.onConfirm.pipe(takeUntil(this._close$)).subscribe(data => {
      resolveAnchor()
      // 协同兜底：会话期间锚点块被远端删除时 anchor.resolve 无法重定位、block
      // 仍指向已 detached 的旧块，applyDeltaOperations 会写进 detached Y.Text
      // 静默丢失。_charAtModelIndex 对 detached 文本可能仍读到旧的 @，挡不住，
      // 必须显式确认块还在文档中。
      if (!this._isBlockAlive(block)) {
        this._close$.next()
        return
      }
      if (this._charAtModelIndex(block, index) !== this._trigger) return

      const curSel = this.doc.selection.value
      let end: number
      if (this._isLiveTextCursor(curSel)
        && curSel.firstBlock === block && curSel.start.offset > index) {
        end = curSel.start.offset
      } else {
        end = index + 1
        const yLen = block.yText.length
        while (end < yLen) {
          const c = this._charAtModelIndex(block, end)
          if (c === null || /\s/.test(c)) break
          end++
        }
      }

      // Host opt-out: let the owning block claim this confirm and run its own
      // side-effect instead of inserting an inline embed. Only the acting client
      // reaches here, so a host-side effect (e.g. add a task collaborator) runs
      // exactly once — collaborators never observe a synced node. The @keyword
      // (transient plain text) is removed; nothing is inserted in its place.
      if (this._config.onConfirm?.(data, {block}) === true) {
        block.applyDeltaOperations([
          {retain: index},
          {delete: end - index}
        ])
        this._setCursorAtWhenBlockAlive(block, index)
        this._close$.next()
        return
      }

      // Build embed delta from the confirmed data.
      // The embed key is 'mention' and the display value is data.name.
      // All extra fields from data become embed attributes.
      const {id, name, ...extra} = data
      block.applyDeltaOperations([
        {retain: index},
        {delete: end - index},
        {
          insert: {mention: name},
          attributes: {
            'mentionId': id,
            ...extra as Record<string, any>
          }
        },
        {insert: ' '}
      ])

      this._setCursorAtWhenBlockAlive(block, index + 2)
      this._close$.next()
    })
  }

  private _isBlockAlive(block: EditableBlockComponent): boolean {
    try {
      if (!this.doc.vm.get(block.id)) return false
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _isLiveTextCursor(
    selection: BlockCraft.Selection | null | undefined
  ): selection is BlockCraft.Selection & { start: { type: 'text'; offset: number } } {
    if (!isSelectionAlive(selection as any, this.doc)) return false
    return !!selection?.collapsed && selection.start.type === 'text'
  }

  private _setCursorAtWhenBlockAlive(block: EditableBlockComponent, index: number) {
    nextTick().then(() => {
      if (!this._isBlockAlive(block)) return
      this.doc.selection.setCursorAt(block, index)
    })
  }

  // ─── Delta-aware helpers ───

  private _charAtModelIndex(block: EditableBlockComponent, index: number): string | null {
    const deltas = block.yText.toDelta() as DeltaInsert[]
    let pos = 0
    for (const d of deltas) {
      const len = typeof d.insert === 'string' ? d.insert.length : 1
      if (index < pos + len) {
        return typeof d.insert === 'string' ? d.insert.charAt(index - pos) : null
      }
      pos += len
    }
    return null
  }

  private _textBetween(block: EditableBlockComponent, start: number, end: number): string {
    const deltas = block.yText.toDelta() as DeltaInsert[]
    let pos = 0
    let result = ''
    for (const d of deltas) {
      const len = typeof d.insert === 'string' ? d.insert.length : 1
      if (pos >= end) break
      if (pos + len > start && typeof d.insert === 'string') {
        const from = Math.max(0, start - pos)
        const to = Math.min(len, end - pos)
        result += d.insert.slice(from, to)
      }
      pos += len
    }
    return result
  }

  private _getCharRect(block: EditableBlockComponent, modelIndex: number): DOMRect | null {
    try {
      const result = block.runtime.findBlotByOffset(modelIndex)
      if (!result) return null
      const {blot, localOffset} = result
      if (!(blot instanceof TextBlot)) {
        return (blot.domNode as HTMLElement).getBoundingClientRect()
      }
      const range = document.createRange()
      range.setStart(blot.textNode, localOffset)
      range.setEnd(blot.textNode, localOffset + 1)
      return range.getClientRects()[0] || null
    } catch {
      return null
    }
  }

  destroy(): void {}
}
