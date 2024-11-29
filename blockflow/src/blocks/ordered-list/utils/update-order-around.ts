import {BlockModel, Controller} from "../../../core";
import {IOrderedListBlockModel} from "../type";

export const updateOrderAround = (block: BlockModel<IOrderedListBlockModel>, controller: Controller) => {
  if (block.flavour !== 'ordered-list') return
  const position = block.getPosition()
  const parentChildren = position.parentId ? controller.getBlockModel(position.parentId)!.children as BlockModel[] : controller.rootModel

  const aroundOrderBlocks: BlockModel<IOrderedListBlockModel>[] = []
  for (let i = position.index - 1; i >= 0; i--) {
    const prevBlock = parentChildren[i]
    if (prevBlock.flavour !== 'ordered-list' && (!prevBlock.props.indent || prevBlock.props.indent === 0)) break
    if (prevBlock.flavour === 'ordered-list' && prevBlock.props.indent === 0) {
      aroundOrderBlocks.unshift(prevBlock as BlockModel<IOrderedListBlockModel>)
      break
    }
    // if (prevBlock.flavour !== 'ordered-list' && <number>prevBlock.props.indent <= block.props.indent) break
    // if(prevBlock.flavour === 'ordered-list' && <number>prevBlock.props.indent < block.props.indent) {
    //   aroundOrderBlocks.unshift(prevBlock as BlockModel<IOrderedListBlockModel>)
    //   break
    // }
    prevBlock.flavour === 'ordered-list' && aroundOrderBlocks.unshift(prevBlock as BlockModel<IOrderedListBlockModel>)
  }

  for (let j = position.index; j < parentChildren.length; j++) {
    const nextBlock = parentChildren[j]
    if (nextBlock.flavour !== 'ordered-list' && (!nextBlock.props.indent || nextBlock.props.indent === 0)) break
    // if(nextBlock.flavour !== 'ordered-list' && <number>nextBlock.props.indent >= block.props.indent) break
    aroundOrderBlocks.push(nextBlock as BlockModel<IOrderedListBlockModel>)
  }

  console.log('aroundOrderBlocks', aroundOrderBlocks)
  const orderMap: Record<number, number> = {}
  let prevIndent = aroundOrderBlocks[0].props.indent
  orderMap[aroundOrderBlocks[0].props.indent] = aroundOrderBlocks[0].props.order
  aroundOrderBlocks.slice(1).forEach((b, i) => {

    if (typeof orderMap[b.props.indent] === 'undefined' || b.props.indent > prevIndent) {
      orderMap[b.props.indent] = 0
      b.props.order !== 0 && b.setProp('order', 0)
      prevIndent = b.props.indent
      return
    }

    const correctOrder = orderMap[b.props.indent] + 1
    b.props.order !== correctOrder && b.setProp('order', correctOrder)
    orderMap[b.props.indent] = correctOrder
    prevIndent = b.props.indent

    // const correctOrder = orderMap[b.props.indent] === undefined ? 0 : orderMap[b.props.indent] + 1
    // b.props.order !== correctOrder && b.setProp('order', correctOrder)
    // orderMap[b.props.indent] = correctOrder
  })
  return;

}


