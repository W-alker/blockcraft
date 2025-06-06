import {BaseBlockComponent, DocPlugin} from "../framework";
import {Subscription} from "rxjs";
import {OrderedBlockModel} from "../blocks";
import {nextTick} from "../global";

export class AutoUpdateOrderPlugin extends DocPlugin {
  private _sub = new Subscription()

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
          updateOrderAround(tr.block as any)
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

  for (let i = index - 1; i >= 0; i--) {
    const prevBlock = parentChildren[i]
    if (prevBlock.flavour === 'ordered') {
      aroundOrderBlocks.unshift(prevBlock)
    }
    if (!prevBlock.props.depth) break
  }

  for (let j = index; j < parentChildren.length; j++) {
    const nextBlock = parentChildren[j]
    if (nextBlock.flavour === 'ordered') {
      aroundOrderBlocks.push(nextBlock)
    }
    if (nextBlock.flavour !== 'ordered' && !nextBlock.props.depth) break
    // if(nextBlock.flavour !== 'ordered-block' && <number>nextBlock.props.indent >= block.props.indent) break
  }

  if (!aroundOrderBlocks.length) return

  const orderMap: Record<number, number> = {}
  let prevIndent = aroundOrderBlocks[0].props.depth
  orderMap[aroundOrderBlocks[0].props.depth] = aroundOrderBlocks[0].props.order
  aroundOrderBlocks.slice(1).forEach((b, i) => {

    if (typeof orderMap[b.props.depth] === 'undefined' || b.props.depth > prevIndent) {
      orderMap[b.props.depth] = 0
      b.props.order !== 0 && b.updateProps({
        order: 0
      })
      prevIndent = b.props.depth
      return
    }

    const correctOrder = orderMap[b.props.depth] + 1
    b.props.order !== correctOrder && b.updateProps({
      order: correctOrder
    })
    orderMap[b.props.depth] = correctOrder
    prevIndent = b.props.depth
  })
  return;

}


