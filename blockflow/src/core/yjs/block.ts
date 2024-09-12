import {IBlockModel} from "@core";
import Y from "@core/yjs";

export class BlockModel<Model extends IBlockModel = IBlockModel> {

  constructor(private readonly model: IBlockModel) {
  }

  private transformToYModel(block: IBlockModel) {
    let map: Y.Map<any>

    let children
    if (block.children) {

      if (block.nodeType === 'editable') {
        children = new Y.Text()
        block.children.length && children.applyDelta(block.children)
      } else {
        children = Y.Array.from((block.children as IBlockModel[]).map(this.transformToYModel))
      }

    }

    return map
  }

  get id() {
    return this.model.id
  }

  get flavour() {
    return this.model.flavour
  }

  get nodeType() {
    return this.model.nodeType
  }


}
