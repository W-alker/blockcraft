import {ComponentRef} from '@angular/core'
import {Subject, Subscription, takeUntil} from 'rxjs'
import {
  closetBlockId,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
  normalizeRange,
  UIEventStateContext,
} from '../../framework'
import {
  closestInlineDateElement,
  createInlineDateDelta,
  readInlineDateElement,
} from '../../embeds'
import {InlineDateEditDialog} from './widgets/date-edit-dialog'

/**
 * 点开行内日期 embed，弹框改时刻 / 换显示格式。
 *
 * 日期值是**定格**的：插入那一刻求值写死，之后只有这个弹框能改它。插件不订阅
 * 时钟、不在渲染期现算——否则同一份文档在不同人、不同时间打开会显示不同内容。
 */
export class DateInlineExtensionPlugin extends DocPlugin {
  override name = 'date-inline-extension'

  private readonly _closeDialog$ = new Subject<void>()
  private readonly _sub = new Subscription()
  private _activeBlock: BlockCraft.BlockComponent | null = null
  private _activeDateEl: HTMLElement | null = null
  private _dialogRef: ComponentRef<InlineDateEditDialog> | null = null

  init() {
    this._sub.add(
      this.doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.closeDialog()
      }),
    )
    const stateChange$ = this.doc.readonlyManager?.stateChange$
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const block = this._activeBlock
        if (block && (!this._isBlockAlive(block) || this._isReadonly(block))) {
          this.closeDialog()
        }
      }))
    }
  }

  @EventListen('mouseDown', {flavour: 'root'})
  onInlineClick(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return

    const target = ctx.getDefaultEvent().target
    if (!(target instanceof HTMLElement)) return

    const dateEl = closestInlineDateElement(target)
    if (!dateEl) return

    const blockId = closetBlockId(dateEl)
    if (!blockId) return

    const block = this._getLiveBlockById(blockId)
    if (!block) return
    if (!this.doc.isEditable(block)) return
    if (this._isReadonly(block)) return

    this.closeDialog()
    this._activeBlock = block
    this._activeDateEl = dateEl
    dateEl.classList.add('editing')

    const {value, format} = readInlineDateElement(dateEl)
    const {componentRef} =
      this.doc.overlayService.createConnectedOverlay<InlineDateEditDialog>(
        {
          target: dateEl,
          component: InlineDateEditDialog,
          positions: [
            getPositionWithOffset('bottom-left', 0, 8),
            getPositionWithOffset('top-left', 0, 8),
          ],
          backdrop: true,
        },
        this._closeDialog$,
        this.closeDialog,
      )

    componentRef.setInput('value', value)
    componentRef.setInput('format', format)
    this._dialogRef = componentRef

    componentRef.instance.close
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(() => this.closeDialog())

    componentRef.instance.update
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(result => {
        this._applyUpdate(block, dateEl, result.value, result.format)
        this.closeDialog()
      })

    return true
  }

  /**
   * 用「删 1 + 插新」整体换掉 embed，而不是原地改 DOM：embed 的逻辑长度恒为 1，
   * 位置从实时 DOM range 反解出来，所以协同下别人在前面插了字也不会写错地方。
   */
  private _applyUpdate(
    block: EditableBlockComponent,
    dateEl: HTMLElement,
    value: string,
    format: string,
  ): void {
    if (!this._isBlockAlive(block) || this._isReadonly(block)) return

    const delta = createInlineDateDelta(value, format)
    if (!delta) return

    const range = this._tryGetEmbedRange(dateEl)
    if (!range || range.start.type !== 'text' || range.start.blockId !== block.id) {
      return
    }

    const embedIndex = range.start.offset
    block.applyDeltaOperations([
      {retain: embedIndex},
      {delete: 1},
      {insert: delta.insert, attributes: delta.attributes},
    ])

    requestAnimationFrame(() => {
      if (!this._isBlockAlive(block)) return
      this.doc.selection.setCursorAt(block, embedIndex + 1)
    })
  }

  private _tryGetEmbedRange(target: HTMLElement) {
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(true)
    try {
      return normalizeRange(range, id => this.doc.getBlockById(id) as any)
    } catch {
      return null
    } finally {
      range.detach()
    }
  }

  private _isReadonly(block: BlockCraft.BlockComponent): boolean {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent): boolean {
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _getLiveBlockById(blockId: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(blockId)
      return this._isBlockAlive(block) ? block : null
    } catch {
      return null
    }
  }

  closeDialog = () => {
    this._activeDateEl?.classList.remove('editing')
    this._closeDialog$.next()
    this._activeBlock = null
    this._activeDateEl = null
    this._dialogRef = null
  }

  destroy() {
    this.closeDialog()
    this._sub.unsubscribe()
  }
}

export {InlineDateEditDialog} from './widgets/date-edit-dialog'
export type {InlineDateEditResult} from './widgets/date-edit-dialog'
