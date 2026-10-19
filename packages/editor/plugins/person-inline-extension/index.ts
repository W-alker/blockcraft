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
  INLINE_PERSON_CLASS,
  createInlinePersonEmbedConverter,
  isInlinePersonFormat,
} from '../../embeds/person'
import {InlinePersonFormatDialog} from './person-format-dialog'

/** 行内人员仅编辑显示格式；人员快照和模板来源保持不变。 */
export class PersonInlineExtensionPlugin extends DocPlugin {
  override name = 'person-inline-extension'

  private readonly _closeDialog$ = new Subject<void>()
  private readonly _sub = new Subscription()
  private _activeBlock: BlockCraft.BlockComponent | null = null
  private _activePersonEl: HTMLElement | null = null

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
    if (!(target instanceof Element)) return

    const personEl = target.closest<HTMLElement>(`.${INLINE_PERSON_CLASS}`)
    if (!personEl) return

    const blockId = closetBlockId(personEl)
    if (!blockId) return

    const block = this._getLiveBlockById(blockId)
    if (!block) return
    if (!this.doc.isEditable(block)) return
    if (this._isReadonly(block)) return

    this.closeDialog()
    this._activeBlock = block
    this._activePersonEl = personEl
    personEl.classList.add('editing')

    const delta = createInlinePersonEmbedConverter().toDelta(personEl)
    const {componentRef} =
      this.doc.overlayService.createConnectedOverlay<InlinePersonFormatDialog>(
        {
          target: personEl,
          component: InlinePersonFormatDialog,
          positions: [
            getPositionWithOffset('bottom-left', 0, 8),
            getPositionWithOffset('top-left', 0, 8),
          ],
          backdrop: true,
        },
        this._closeDialog$,
        this.closeDialog,
      )

    componentRef.setInput('delta', delta)

    componentRef.instance.close
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(() => this.closeDialog())

    componentRef.instance.update
      .pipe(takeUntil(this._closeDialog$))
      .subscribe(result => {
        this._applyUpdate(block, personEl, result)
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
    personEl: HTMLElement,
    format: string,
  ): void {
    if (!this._isBlockAlive(block) || this._isReadonly(block)) return

    if (!isInlinePersonFormat(format) || !personEl.isConnected) return
    const delta = createInlinePersonEmbedConverter().toDelta(personEl)
    delta.attributes = {...delta.attributes, personFormat: format}

    const range = this._tryGetEmbedRange(personEl)
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
    this._activePersonEl?.classList.remove('editing')
    this._closeDialog$.next()
    this._activeBlock = null
    this._activePersonEl = null
  }

  destroy() {
    this.closeDialog()
    this._sub.unsubscribe()
  }
}
