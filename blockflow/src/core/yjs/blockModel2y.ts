import {IBlockModel, IBlockProps, SimpleRecord, SimpleValue} from "@core/types";
import Y from "@core/yjs";
import {BehaviorSubject} from "rxjs";

export type YBlockModel = Y.Map<unknown>

const addSyncFlag = (obj: any) => {
  Object.defineProperty(obj, '_isSynced_', {
    value: true,
    enumerable: false,
    writable: false
  })
  return obj
}

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
        children = Y.Array.from((block.children as IBlockModel[]).map(child => this.blockModel2Y(child, cb)))
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
    addSyncFlag(block)
    return map
  }

  syncChangeBlockModel = (block: IBlockModel, yMap: YBlockModel) => {
    block.props = this.obj2y(block.props, yMap.get('props') as Y.Map<any>).obj
    block.meta = this.obj2y(block.meta, yMap.get('meta') as Y.Map<any>).obj
    let yChildren = yMap.get('children') as Y.Array<any>
    if (block.children) {
      if (block.nodeType === 'editable') {
        return
      } else {
        for(let i = 0; i < block.children.length; i++) {
          this.syncChangeBlockModel(block.children[i] as IBlockModel, yChildren.get(i) as YBlockModel)
        }
      }
    }
  }

  syncChangeMap = <T extends SimpleRecord>(obj: T, yObj: Y.Map<any>): T => {
    return syncChangeMap(obj, yObj, this.stopSign)
  }

  syncChangeArray = (obj: any[], yObj: Y.Array<any>) => {
    return syncChangeArray(obj, yObj, this.stopSign)
  }

  private obj2y = <T extends SimpleRecord | Array<SimpleValue>>(obj: T, yObj?: Y.Array<any> | Y.Map<any>) => {
    if (obj instanceof Array) {
      if (yObj && !(yObj instanceof Y.Array)) throw TypeError('yObj should be an instance of Y.Array')
      const yarr = yObj || new Y.Array<any>()
      obj.forEach((v, i) => {
        if (typeof v === 'object') {
          yarr.push([this.obj2y(v as T, yObj?.get(i) as any).yObj])
          return
        }
        yarr.push([v])
      })
      syncChangeArray(obj, yarr, this.stopSign)
      return {
        obj: obj,
        yObj: yarr
      }
    }

    if (yObj && !(yObj instanceof Y.Map)) throw TypeError('yObj should be an instance of Y.Map')
    const ym = yObj || new Y.Map<any>()
    for (const key in obj) {
      const v = obj[key]
      if (typeof v === 'object') {
        ym.set(key, this.obj2y(v as T, yObj?.get(key) as any).yObj)
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


export const syncChangeMap = <T extends SimpleRecord>(obj: T, yObj: Y.Map<any>, stopSyncToY: BehaviorSubject<boolean>): T => {
  if (obj['_isSynced_']) return obj
  addSyncFlag(obj)
  return new Proxy(obj, {
    set(target, prop, value) {
      if (typeof prop === 'symbol') throw TypeError('key cannot be a symbol')
      !stopSyncToY.value && yObj.set(prop, value)
      return Reflect.set(target, prop, value)
    },
    deleteProperty(target: IBlockProps, p: string | symbol): boolean {
      if (typeof p === 'symbol') throw TypeError('You try to delete a symbol property, which is not allowed.')
      !stopSyncToY.value && yObj.delete(p)
      return Reflect.deleteProperty(target, p)
    }
  })
}

/**
 * @desc sync change of array, this method will return the input original array modified
 * @desc but don`t use 'sort' or 'reverse' method, because it will cause the yjs array out of sync
 */
export const syncChangeArray = (obj: any[], yObj: Y.Array<any>, stopSyncToY: BehaviorSubject<boolean>) => {
  // @ts-ignore
  if (obj['_isSynced_']) return obj
  addSyncFlag(obj)

  const yo = yObj as Y.Array<any>
  Object.defineProperty(obj, 'push', {
    value: function (value: any) {
      !stopSyncToY.value && yo.push([value])
      return Array.prototype.push.call(obj, value)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'unshift', {
    value: function (value: any) {
      !stopSyncToY.value && yo.unshift([value])
      return Array.prototype.unshift.call(obj, value)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'splice', {
    value: function (start: number, deleteCount: number, ...items: any[]) {
      !stopSyncToY.value && deleteCount && yo.delete(start, deleteCount)
      !stopSyncToY.value && items?.length && yo.insert(start, items)
      return Array.prototype.splice.call(obj, start, deleteCount, ...items)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'shift', {
    value: function () {
      !stopSyncToY.value && yo.delete(0, 1)
      return Array.prototype.shift.call(obj)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'pop', {
    value: function () {
      !stopSyncToY.value && yo.delete(obj.length - 1, 1)
      return Array.prototype.pop.call(obj)
    },
    enumerable: false
  })

  return obj
}

