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

export {createDefaultMentionPanel} from "./widget/default-panel";
export type {DefaultMentionPanelConfig} from "./widget/default-panel";
export type {MentionPluginConfig, IMentionPanel, IMentionData, MentionType, IMentionResponse, MentionPanelFactory} from "./types";

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
    if (!curSel?.collapsed || curSel.from.type !== 'text' || curSel.from.block.plainTextOnly) return

    const from = curSel.from
    // Only trigger after a space or at the beginning of the line
    if (from.index > 0) {
      const prevChar = characterAtDelta(from.block.textDeltas(), from.index)
      if (prevChar !== ' ') return
    }

    e.preventDefault()
    const block = from.block as EditableBlockComponent
    const atIndex = from.index

    this._isOpen = true

    // Insert trigger char via controlled rendering
    this.doc.crud.transact(() => {
      block.yText.insert(atIndex, this._trigger)
    })

    this.doc.selection.setSelection({
      ...from,
      index: atIndex + 1,
      length: 0
    })

    try {
      this._openSession(block, atIndex)
    } catch {
      this._isOpen = false
    }

    return true
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
      if (!curSel?.collapsed || curSel.from.type !== 'text' || curSel.from.block !== b) return null

      const cursorIndex = curSel.from.index
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
      if (this._charAtModelIndex(block, index) !== this._trigger) return

      const curSel = this.doc.selection.value
      let end: number
      if (curSel?.collapsed && curSel.from.type === 'text'
        && curSel.from.block === block && curSel.from.index > index) {
        end = curSel.from.index
      } else {
        end = index + 1
        const yLen = block.yText.length
        while (end < yLen) {
          const c = this._charAtModelIndex(block, end)
          if (c === null || /\s/.test(c)) break
          end++
        }
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

      nextTick().then(() => {
        this.doc.selection.setCursorAt(block, index + 2)
      })
      this._close$.next()
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
