import {BlockModel, Controller} from "@core";
import {IOrderedListBlockModel} from "@blocks";

export const updateOrderAround = (block: BlockModel<IOrderedListBlockModel>, controller: Controller) => {
  if(block.flavour !== 'ordered-list') return
  const position = block.getPosition()
  const parentChildren = position.parentId ? controller.getBlockModel(position.parentId)!.children as BlockModel[] : controller.rootModel

  let prevOlIndentAndOrderMap: Record<number, number> = {}

  for (let i = position.index - 1; i >= 0; i--) {
    const _b = parentChildren[i]
    if (_b.flavour !== 'ordered-list') continue
    const item = _b as BlockModel<IOrderedListBlockModel>
    const itemIndent = item.props.indent
    if (typeof prevOlIndentAndOrderMap[itemIndent] === 'number') continue
    prevOlIndentAndOrderMap[item.props.indent] = item.props.order
    if (item.props.indent === 0) break
  }

  for (let j = position.index; j < parentChildren.length; j++) {
    const _b = parentChildren[j]

    if (_b.flavour !== 'ordered-list' && !_b.props['indent']) break


    if (_b.flavour === 'ordered-list') {
      const item = _b as BlockModel<IOrderedListBlockModel>
      if (typeof prevOlIndentAndOrderMap[item.props.indent] === 'number') {
        item.setProp('order', prevOlIndentAndOrderMap[item.props.indent] + 1)
      } else {
        item.setProp('order', 0)
      }
      prevOlIndentAndOrderMap[item.props.indent] = item.props.order
    }

  }


}


