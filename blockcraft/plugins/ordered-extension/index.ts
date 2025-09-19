import {
  BaseBlockComponent,
  closetBlockId,
  DocPlugin,
  EventListen,
  getPositionWithOffset,
  UIEventStateContext
} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {OrderedBlockModel} from "../../blocks";
import {nextTick} from "../../global";
import {OrderedPrefixToolbar} from "./widgets/ordered-prefix-toolbar";

export class OrderedBlockPlugin extends DocPlugin {
  private _sub = new Subscription()

  private _closeToolbar$ = new Subject()

  @EventListen('mouseDown', {flavour: "ordered"})
  onMouseDown(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const evt = ctx.getDefaultEvent<MouseEvent>()
    if (evt.button !== 0 || !(evt.target instanceof HTMLButtonElement) || !evt.target.classList.contains('ordered-block-prefix')) return

    const blockId = closetBlockId(evt.target)
    if (!blockId) return
    const orderedBlock = this.doc.getBlockById(blockId) as BlockCraft.IBlockComponents['ordered']
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<OrderedPrefixToolbar>({
      target: evt.target,
      component: OrderedPrefixToolbar,
      positions: [getPositionWithOffset('bottom-left'), getPositionWithOffset('top-left')],
      backdrop: true
    }, this._closeToolbar$)
    orderedBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this._closeToolbar$.next(true)
    })

    componentRef.setInput('orderedBlock', orderedBlock)
    componentRef.instance.onPropsChanged$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      updateOrderAround(orderedBlock)
      this._closeToolbar$.next(true)
    })
    return true
  }

  init() {
    this._sub = this.doc.onChildrenUpdate$.subscribe(event => {
      if (event.isUndoRedo) return;

      nextTick().then(() => {

        event.transactions.forEach(tr => {
          const {inserted, deleted, block} = tr
          if (inserted) {
            const b = inserted.find(v => v.flavour === 'ordered')
            if (!b) return
            updateOrderAround(<any>b)
            return
          }

          if (deleted) {
            const ids = block.childrenIds
            if (!ids.length) return;

            deleted.forEach(del => {
              const start = this.doc.getBlockById(ids[Math.max(del.index - 1, 0)])
              if (start.flavour !== 'ordered') return;
              updateOrderAround(<any>start)
            })
          }
        })

      })

    })

    this._sub.add(
      this.doc.onPropsUpdate$.subscribe((event) => {
        if (event.isUndoRedo) return;
        const tr = event.transactions[0]
        if (tr.block.flavour !== 'ordered' || !tr.changes.has('depth')) return
        nextTick().then(() => {
          updateOrderAround(<any>tr.block)
          const nextBlock = this.doc.nextSibling(tr.block)
          nextBlock && nextBlock.flavour === 'ordered' && (nextBlock.props.depth || 0) < (tr.block.props.depth || 0) && updateOrderAround(<any>nextBlock)
        })
      })
    )
  }

  override destroy() {
    this._sub.unsubscribe()
  }
}

const updateOrderAround = (block: BaseBlockComponent<OrderedBlockModel>) => {
  if (block.flavour !== 'ordered') return
  const parent = block.parentBlock
  if (!parent) return

  const parentChildren = parent.getChildrenBlocks()
  const index = parentChildren.indexOf(block)
  if (index === -1) return

  const aroundOrderBlocks: BaseBlockComponent<OrderedBlockModel>[] = []

  aroundOrderBlocks.push(block)

  if (!block.props.start) {
    for (let i = index - 1; i >= 0; i--) {
      const prevBlock = parentChildren[i]
      if (prevBlock.flavour !== 'ordered') {
        if ((prevBlock.props.depth || 0) === block.props.depth && typeof aroundOrderBlocks[0].props.start !== 'number') {
          aroundOrderBlocks[0].updateProps({
            start: 1
          })
          break
        }
        continue
      }
      if ((prevBlock.props.depth || 0) < block.props.depth) {
        break
      }
      if ((prevBlock.props.depth || 0) === block.props.depth) {
        aroundOrderBlocks.unshift(prevBlock)

        if (prevBlock.props.start) break
      }
    }
  }

  for (let j = index + 1; j < parentChildren.length; j++) {
    const nextBlock = parentChildren[j]
    if (nextBlock.flavour !== 'ordered') continue
    if ((nextBlock.props.depth || 0) < block.props.depth) {
      break
    }
    if ((nextBlock.props.depth || 0) === block.props.depth) {
      if (nextBlock.props.start) break

      aroundOrderBlocks.push(nextBlock)
    }
  }

  let order = aroundOrderBlocks[0].props.start ? aroundOrderBlocks[0].props.start - 1 : 0
  for (let b of aroundOrderBlocks) {
    if (b.props.order !== order) {
      b.updateProps({order})
    }
    order++
  }
  return;

}


