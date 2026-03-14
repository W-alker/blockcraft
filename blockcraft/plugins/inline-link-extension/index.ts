import {
  closetBlockId,
  DocPlugin,
  EventListen, FakeRange, getPositionWithOffset,
  INLINE_TEXT_NODE_TAG, INLINE_ELEMENT_TAG
} from "../../framework";
import {skip, Subject, takeUntil} from "rxjs";
import {InlineLinkToolbar} from "./widgets/inline-link-toolbar";
import {nextTick, sliceDelta} from "../../global";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {ComponentRef} from "@angular/core";
import {LinkEditFloatDialog} from "./widgets/link-edit-dialog";
import {OneShotRangeAnchor} from "../../framework/utils/one-shot-selection-anchor";

export class InlineLinkExtension extends DocPlugin {
  override name = 'inline-link-extension'

  private _cpr: ComponentRef<InlineLinkToolbar> | null = null
  private _closeToolbar$ = new Subject<void>()

  private _linkNode: HTMLElement | null = null

  constructor(
    private openLink = (link: string) => {
      window.open(link, '_blank')
    }
  ) {
    super();
  }

  init() {
    this.doc.subscribeReadonlyChange(() => {
      this._cpr?.setInput('isReadOnly', this.doc.isReadonly)
    })
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

    this.openToolbar(target as HTMLElement, link, this.doc.getBlockById(blockId))
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
    const normalizedRange = this.doc.selection.normalizeRange(range)
    const text = range.toString()
    range.detach()
    return {
      textRange: normalizedRange,
      text
    }
  }

  openToolbar(target: HTMLElement, link: string, block: BlockCraft.BlockComponent) {
    if (this._cpr || !this.doc.isEditable(block)) return
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
          this.onEditLink(target, block)
          this.closeToolbar()
          break
        case 'unbind-link': {
          const range = this.getLinkInfo(target).textRange
          if (range.from.type !== 'text' || range.from.block !== block) return;
          block.formatText(range.from.index, range.from.length, {'a:link': null})
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
      if (!sel || sel.to || !sel.collapsed || sel.from.type !== 'text' || !this._linkNode?.contains(sel.raw.startContainer)) {
        this._closeToolbar$.next()
        return
      }
    })

    this.doc.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this._closeToolbar$.next()
    })

  }

  closeToolbar = () => {
    this._closeToolbar$.next()
    this._linkNode = this._cpr = null
  }

  onEditLink(target: HTMLElement, block: BlockCraft.BlockComponent) {
    if (!this.doc.isEditable(block)) return
    const close$ = new Subject<void>()

    let fakeRange: FakeRange

    const linkInfo = this.getLinkInfo(target)
    if (linkInfo.textRange.from.type !== 'text') return

    const rangeAnchor = new OneShotRangeAnchor(this.doc)

    const fallbackRange = {
      block: linkInfo.textRange.from.block,
      index: linkInfo.textRange.from.index,
      length: linkInfo.textRange.from.length
    }
    rangeAnchor.capture(fallbackRange.block, fallbackRange.index, fallbackRange.length)

    const setFakeRange = () => {
      nextTick().then(() => {
        fakeRange?.destroy()
        const _range = rangeAnchor.resolve()
        if(!_range) return
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
      block.yText.unobserve(setFakeRange)
      close$.next()
      fakeRange?.destroy()
    })

    componentRef.setInput('text', linkInfo.text)
    componentRef.setInput('href', this.tryGetLink(target))

    // 伪造选中
    requestAnimationFrame(() => {
      componentRef.instance.focus()
      setFakeRange()
    })

    block.yText.observe(setFakeRange)

    componentRef.instance.close.pipe(takeUntil(close$)).subscribe(() => close$.next())
    componentRef.instance.update.pipe(takeUntil(close$)).subscribe(v => {
      close$.next()
      const currentRange = rangeAnchor.consume(fallbackRange)
      if (!currentRange) return

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

    const _range = this.getLinkInfo(this._linkNode).textRange
    if (_range.from.type !== 'text') return
    const {block, index, length} = _range.from

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
