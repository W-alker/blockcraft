import {BaseBlockComponent, DocPlugin} from "../framework";
import {Subscription} from "rxjs";
import {OrderedBlockModel} from "../blocks";

export class AutoUpdateOrderPlugin extends DocPlugin {
  private _sub = new Subscription()

  onInit() {
    // this._sub = this.doc.onChildrenUpdate$.subscribe(event => {
    //   if (event.inserted) {
    //     return
    //   }
    // })

    this._sub.add(
      this.doc.onPropsUpdate$.subscribe((events) => {
        const ev = events[0]
        if (ev.block.flavour !== 'ordered' || !ev.changes.has('depth')) return
        console.log(ev)
        updateOrderAround(ev.block as any)
      })
    )
  }

  destroy() {
    this._sub.unsubscribe()
  }
}

export const updateOrderAround = (block: BaseBlockComponent<OrderedBlockModel>) => {
  if (block.flavour !== 'ordered') return
  const parent = block.parentBlock
  if (!parent) return

  const parentChildren = parent.getChildrenBlocks()
  const index = parentChildren.indexOf(block)
  if (index === -1) return

  const aroundOrderBlocks: BaseBlockComponent<OrderedBlockModel>[] = []
  for (let i = index - 1; i >= 0; i--) {
    const prevBlock = parentChildren[i]
    if (prevBlock.flavour !== 'ordered' && (!prevBlock.props.depth || prevBlock.props.depth === 0)) break
    if (prevBlock.flavour === 'ordered' && prevBlock.props.depth === 0) {
      aroundOrderBlocks.unshift(prevBlock)
      break
    }
    // if (prevBlock.flavour !== 'ordered-block' && <number>prevBlock.props.indent <= block.props.indent) break
    // if(prevBlock.flavour === 'ordered-block' && <number>prevBlock.props.indent < block.props.indent) {
    //   aroundOrderBlocks.unshift(prevBlock as BlockModel<IOrderedListBlockModel>)
    //   break
    // }
    prevBlock.flavour === 'ordered' && aroundOrderBlocks.unshift(prevBlock)
  }

  for (let j = index; j < parentChildren.length; j++) {
    const nextBlock = parentChildren[j]
    if (nextBlock.flavour !== 'ordered' && (!nextBlock.props.depth || nextBlock.props.depth === 0)) break
    // if(nextBlock.flavour !== 'ordered-block' && <number>nextBlock.props.indent >= block.props.indent) break
    aroundOrderBlocks.push(nextBlock)
  }

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


