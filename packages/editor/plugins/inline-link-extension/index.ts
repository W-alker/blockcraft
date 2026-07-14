import {
  closetBlockId,
  DocPlugin,
  EditableBlockComponent,
  EventListen, FakeRange, getPositionWithOffset,
  INLINE_TEXT_NODE_TAG, INLINE_ELEMENT_TAG,
  normalizeRange,
} from "../../framework";
import {skip, Subject, Subscription, takeUntil} from "rxjs";
import {InlineLinkToolbar} from "./widgets/inline-link-toolbar";
import {nextTick, sliceDelta} from "../../global";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {ComponentRef} from "@angular/core";
import {LinkEditFloatDialog} from "./widgets/link-edit-dialog";
import {OneShotRangeAnchor} from "../../framework/utils/one-shot-selection-anchor";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

type TextLinkInfo = {
  textRange: {
    blockId: string
    block: EditableBlockComponent
    index: number
    length: number
  }
  text: string
}

export class InlineLinkExtension extends DocPlugin {
  override name = 'inline-link-extension'

  private _cpr: ComponentRef<InlineLinkToolbar> | null = null
  private _closeToolbar$ = new Subject<void>()
  private _sub = new Subscription()

  private _linkNode: HTMLElement | null = null

  constructor(
    private openLink = (link: string) => {
      window.open(link, '_blank')
    }
  ) {
    super();
  }

  init() {
    this._sub.add(
      this.doc.subscribeReadonlyChange(() => {
        this._cpr?.setInput('isReadOnly', this.doc.isReadonly)
      })
    )
  }

  @EventListen('doubleClick', {flavour: "root"})
  onDoubleClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target || !(target instanceof HTMLElement)) return
    const link = this.tryGetLink(target)
    if (!link) return
    this.openLink(link)
    return true
  }

  @EventListen('mouseDown', {flavour: "root"})
  onClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target || !(target instanceof HTMLElement)) return
    const link = this.tryGetLink(target)
    if (!link) return

    const blockId = closetBlockId(target)
    if (!blockId) return

    const block = this._getLiveBlockById(blockId)
    if (!block) return
    this.openToolbar(target as HTMLElement, link, block)
    return true
  }

  tryGetLink(target: HTMLElement) {
    const link = target.localName === INLINE_TEXT_NODE_TAG ? target.parentElement?.getAttribute('link') : null
    if (!link) return null
    return link
  }

  getLinkInfo(target: HTMLElement) {
    const nodeRange = adjustRangeByLinkNode(target)
    const range = document.createRange()

    const startTextNode = nodeRange.start.firstElementChild!.firstChild as Text
    const endTextNode = nodeRange.end.firstElementChild!.firstChild as Text
    range.setStart(startTextNode, 0)
    range.setEnd(endTextNode, endTextNode.wholeText.length)
    try {
      const endpoints = normalizeRange(
        range,
        id => this.doc.getBlockById(id) as any,
      )
      const {start, end} = endpoints
      if (
        start.type !== 'text' ||
        end.type !== 'text' ||
        start.blockId !== end.blockId
      ) {
        throw new Error('Link DOM range must resolve to one text block')
      }
      return {
        textRange: {
          blockId: start.blockId,
          block: start.block,
          index: start.offset,
          length: end.offset - start.offset,
        },
        text: range.toString(),
      }
    } finally {
      range.detach()
    }
  }

  private _tryGetTextLinkInfo(target: HTMLElement): TextLinkInfo | null {
    try {
      return this.getLinkInfo(target)
    } catch {
      return null
    }
  }

  openToolbar(target: HTMLElement, link: string, block: BlockCraft.BlockComponent) {
    if (this._cpr || !this._isBlockAlive(block) || !this.doc.isEditable(block)) return
    this._linkNode = target

    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<InlineLinkToolbar>({
      target,
      component: InlineLinkToolbar,
    }, this._closeToolbar$, this.closeToolbar)

    this._cpr = componentRef
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('link', link ?? '')

    this._cpr.instance.itemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(item => {

      switch (item.name) {
        case 'open-link': {
          const link = this.tryGetLink(target)
          link && this.openLink(link)
        }
          break
        case 'edit-link':
          if (!this._isBlockAlive(block)) return
          this.onEditLink(target, block)
          this.closeToolbar()
          break
        case 'unbind-link': {
          const linkInfo = this._tryGetTextLinkInfo(target)
          if (!linkInfo || linkInfo.textRange.block !== block || !this._isBlockAlive(block)) return;
          const {index, length} = linkInfo.textRange
          block.formatText(index, length, {'a:link': null})
          this.closeToolbar()
        }
          break
        case 'copy-link':
          this.doc.clipboard.copyText(link).then(() => {
            this.doc.messageService.success('链接已复制')
          })
          return
        case 'switch-view':
          if (item.value === 'card') {
            this.switchView()
          }
          this.closeToolbar()
          return
      }
    })

    this.doc.selection.selectionChange$.pipe(skip(1), takeUntil(this._closeToolbar$)).subscribe(sel => {
      if (!sel || !sel.isInSameBlock || !sel.collapsed || sel.start.type !== 'text' || !this._isCursorInLink(sel, link)) {
        this._closeToolbar$.next()
        return
      }
    })

    this.doc.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this._closeToolbar$.next()
    })

  }

  private _isCursorInLink(sel: BlockCraft.Selection, link: string): boolean {
    if (!isSelectionAlive(sel as any, this.doc)) return false
    if (sel.start.type !== 'text') return false
    const block = sel.firstBlock
    if (!this._isBlockAlive(block) || !this.doc.isEditable(block)) return false
    const offset = sel.start.offset
    const deltas = (block as any).textDeltas()
    let pos = 0
    for (const d of deltas) {
      const len = typeof d.insert === 'string' ? d.insert.length : 1
      if (pos <= offset && offset < pos + len) {
        return d.attributes?.['a:link'] === link
      }
      pos += len
    }
    return false
  }

  closeToolbar = () => {
    this._closeToolbar$.next()
    this._linkNode = this._cpr = null
  }

  onEditLink(target: HTMLElement, block: BlockCraft.BlockComponent) {
    if (!this._isBlockAlive(block) || !this.doc.isEditable(block)) return
    const close$ = new Subject<void>()
    let closed = false

    let fakeRange: FakeRange

    const linkInfo = this._tryGetTextLinkInfo(target)
    if (!linkInfo) return

    const rangeAnchor = new OneShotRangeAnchor(this.doc)

    const fallbackRange = {
      block: linkInfo.textRange.block,
      index: linkInfo.textRange.index,
      length: linkInfo.textRange.length
    }
    rangeAnchor.capture(fallbackRange.block, fallbackRange.index, fallbackRange.length)

    const setFakeRange = () => {
      nextTick().then(() => {
        if (closed) return
        fakeRange?.destroy()
        const _range = rangeAnchor.resolve()
        if(!_range || !this._isBlockAlive(_range.block)) return
        fakeRange = this.doc.selection.createFakeRange({
          from: {
            ..._range,
            blockId: _range.block.id,
            type: 'text'
          },
          to: null
        })
      })
    }

    const {componentRef} = this.doc.overlayService.createConnectedOverlay<LinkEditFloatDialog>({
      target: target,
      component: LinkEditFloatDialog,
      positions: [
        getPositionWithOffset('top-left', 0, 4),
        getPositionWithOffset('bottom-left', 0, 4),
      ],
      backdrop: true
    }, close$, () => {
      if (closed) return
      closed = true
      block.yText.unobserve(setFakeRange)
      close$.next()
      fakeRange?.destroy()
    })

    componentRef.setInput('text', linkInfo.text)
    componentRef.setInput('href', this.tryGetLink(target))

    // 伪造选中
    requestAnimationFrame(() => {
      if (closed) return
      componentRef.instance.focus()
      setFakeRange()
    })

    block.yText.observe(setFakeRange)

    componentRef.instance.close.pipe(takeUntil(close$)).subscribe(() => close$.next())
    componentRef.instance.update.pipe(takeUntil(close$)).subscribe(v => {
      close$.next()
      const currentRange = rangeAnchor.consume(fallbackRange)
      if (!currentRange || !this._isBlockAlive(currentRange.block)) return

      const currentText = currentRange.block.textContent().slice(currentRange.index, currentRange.index + currentRange.length)
      if (currentText !== v.text) {
        currentRange.block.replaceText(currentRange.index, currentRange.length, v.text, {'a:link': v.href})
      } else {
        currentRange.block.formatText(currentRange.index, currentRange.length, {'a:link': v.href})
      }
      currentRange.block.setInlineRange(currentRange.index, v.text.length)
    })
  }

  switchView() {
    if (!this._linkNode) return
    const link = this.tryGetLink(this._linkNode)
    if (!link) return

    const linkInfo = this._tryGetTextLinkInfo(this._linkNode)
    if (!linkInfo) return
    const _range = linkInfo.textRange
    const {block, index, length} = _range
    if (!this._isBlockAlive(block) || !this.doc.isEditable(block)) return

    const bookmark = this.doc.schemas.createSnapshot('bookmark', [link])
    const insertBlocks: IBlockSnapshot[] = [bookmark]

    if (index + length < block.textLength) {
      const splitRightDeltas = sliceDelta(block.textDeltas(), index + length)
      insertBlocks.push(this.doc.schemas.createSnapshot(block.flavour, [splitRightDeltas, block.props]))
    }

    void this.doc.chain()
      .transact(() => {
        block.deleteText(index, block.textLength - index)
        this.doc.crud.insertBlocksAfter(block, insertBlocks)
      })
      .selectBlock(bookmark.id)
      .run()
  }

  destroy() {
    this.closeToolbar()
    this._sub.unsubscribe()
  }

  private _getLiveBlockById(blockId: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(blockId)
      return this._isBlockAlive(block) ? block : null
    } catch {
      return null
    }
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }
}

const adjustRangeByLinkNode = (node: HTMLElement) => {
  node.localName === INLINE_TEXT_NODE_TAG && (node = node.parentElement!)

  let start = node
  let end = node

  const link = node.getAttribute('link')

  while (start.previousElementSibling) {
    const prevSibling = start.previousElementSibling
    if (prevSibling.localName === INLINE_ELEMENT_TAG && prevSibling.getAttribute('link') === link) {
      if ((prevSibling.firstElementChild as HTMLElement).localName !== INLINE_TEXT_NODE_TAG) break
      start = prevSibling as HTMLElement
      continue
    }
    break
  }

  while (end.nextElementSibling) {
    const nextSibling = end.nextElementSibling
    if (nextSibling.localName === INLINE_ELEMENT_TAG && nextSibling.getAttribute('link') === link) {
      if ((nextSibling.firstElementChild as HTMLElement).localName !== INLINE_TEXT_NODE_TAG) break
      end = nextSibling as HTMLElement
      continue
    }
    break
  }
  return {
    start,
    end
  }
}
