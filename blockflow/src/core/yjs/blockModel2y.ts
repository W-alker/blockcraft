import {IBlockModel, SimpleRecord, SimpleValue} from "@core/types";
import {syncChangeArray, syncChangeMap} from "@core/yjs/changeProxy";
import Y from "@core/yjs";
import {BehaviorSubject} from "rxjs";

export type YBlockModel = Y.Map<unknown>

export class ModelSyncer {
  constructor(private readonly stopSign: BehaviorSubject<boolean>) {
  }

  blockModel2Y = (block: IBlockModel, cb?: (block: IBlockModel, yMap: Y.Map<any>) => void): YBlockModel => {
    let map: Y.Map<any>

    let children
    if (block.children) {

      if (block.nodeType === 'editable') {
        children = new Y.Text()
        block.children.length && children.applyDelta(block.children)
      } else {
        children = new Y.Array()
        children.push(
          (block.children as IBlockModel[]).map(child => this.blockModel2Y(child, cb))
        )
      }

    }

    const {obj: props, yObj: yProps} = this.obj2y(block.props)
    const {obj: meta, yObj: yMeta} = this.obj2y(block.meta)
    block.props = props
    block.meta = meta

    map = new Y.Map(
      [
        ['flavour', block.flavour],
        ['id', block.id],
        ['nodeType', block.nodeType],
        ['props', yProps],
        ['meta', yMeta],
        ['children', children],
      ]
    )

    cb && cb(block, map)
    return map
  }

  private obj2y = <T extends SimpleRecord | Array<SimpleValue>>(obj: T) => {
    if (obj instanceof Array) {
      const yarr = new Y.Array<unknown>()
      yarr.push(obj)
      syncChangeArray(obj, yarr, this.stopSign)
      return {
        obj: obj,
        yObj: yarr
      }
    }

    const ym = new Y.Map<unknown>()
    for (const key in obj) {
      const v = obj[key]
      if (typeof v === 'object') {
        ym.set(key, this.obj2y(v as T).yObj)
        continue
      }
      ym.set(key, v)
    }
    const _o = syncChangeMap(obj, ym, this.stopSign)
    return {
      obj: _o as T,
      yObj: ym
    }
  }

}


