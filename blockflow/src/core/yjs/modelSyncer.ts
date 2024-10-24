import Y, {YBlockModel} from "./index";
import {IBlockModel, IBlockProps, SimpleRecord, SimpleValue} from "../types";


export const isBlockModel = (obj: any): obj is IBlockModel => {
  return obj.nodeType && obj.id && obj.flavour
}

export class ModelSyncer {
  constructor() {
  }

  static blockModel2Y = (block: IBlockModel, cb?: (block: IBlockModel, yMap: YBlockModel) => void): YBlockModel => {
    let map: Y.Map<any>

    let children
    if (block.nodeType === 'editable') {
      children = new Y.Text()
      block.children.length && children.applyDelta(block.children)
    } else {
      children = Y.Array.from((block.children as IBlockModel[]).map(child => this.blockModel2Y(child, cb)))
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

  static proxy(obj: Object, yObj: Y.Map<any> | Y.Array<any>, cb?: (obj: IBlockModel, yObj: Y.Map<any>) => void) {
    if (typeof obj !== 'object') return obj
    if (isBlockModel(obj)) {
      // @ts-ignore
      obj.meta = this.proxyMap(obj.meta, yObj.get('meta'))
      // @ts-ignore
      obj.props = this.proxyMap(obj.props, yObj.get('props') as Y.Map<any>)
      cb && cb(obj, yObj as Y.Map<any>)
      if (obj.nodeType === 'block') {
        const children = obj.children as IBlockModel[]
        // @ts-ignore
        const yChildren = yObj.get('children') as Y.Array<any>
        children.forEach((child, i) => {
          children[i] = this.proxy(child, yChildren.get(i) as Y.Map<any>, cb) as IBlockModel
        })
      }
      return obj
    }

    if (obj instanceof Array) {
      return this.proxyArray(obj, yObj as Y.Array<any>)
    }
    return this.proxyMap(obj, yObj as Y.Map<any>)

  }

  static proxyMap(obj: Record<string, any>, yMap: Y.Map<any>) {
    // console.log('proxyMap', obj, yMap)
    for (const key in obj) {
      const v = obj[key]
      if (typeof v === 'object')
        obj[key] = this.proxy(v, yMap.get(key))
    }
    return syncChangeMap(obj, yMap)
  }

  static proxyArray(arr: any[], yArr: Y.Array<any>) {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]
      if (isBlockModel(v))
        arr[i] = this.proxy(v, yArr.get(i))
    }
    return syncChangeArray(arr, yArr)
  }

  private static obj2y = <T extends SimpleRecord | Array<SimpleValue>>(obj: T) => {
    // console.log('obj2y', obj)

    if (obj instanceof Array) {
      const yarr = new Y.Array<unknown>()
      yarr.push(obj)
      syncChangeArray(obj, yarr)
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
    const _o = syncChangeMap(obj, ym,)
    return {
      obj: _o as T,
      yObj: ym
    }
  }

}

const syncChangeMap = <T extends SimpleRecord>(obj: T, yObj: Y.Map<any>): T => {
  return new Proxy(obj, {
    set(target, prop, value) {
      console.log('set', prop, value)
      if (typeof prop === 'symbol') throw TypeError('key cannot be a symbol')
      if (prop.startsWith('__')) return Reflect.set(target, prop.slice(2), value)
      yObj.set(prop, value)
      return Reflect.set(target, prop, value)
    },
    deleteProperty(target: IBlockProps, p): boolean {
      if (typeof p === 'symbol') throw TypeError('You try to delete a symbol property, which is not allowed.')
      if (p.startsWith('__')) return Reflect.deleteProperty(target, p.slice(2))
      yObj.delete(p)
      return Reflect.deleteProperty(target, p)
    }
  })
}

/**
 * @desc sync change of array, this method will return the input original array modified
 * @desc but don`t use 'sort' or 'reverse' method, because it will cause the yjs array out of sync
 */
const syncChangeArray = (obj: any[], yObj: Y.Array<any>) => {
  const yo = yObj as Y.Array<unknown>

  Object.defineProperty(obj, 'push', {
    value: function (value: any) {
      yo.push([value])
      return Array.prototype.push.call(obj, value)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'unshift', {
    value: function (value: any) {
      yo.unshift([value])
      return Array.prototype.unshift.call(obj, value)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'splice', {
    value: function (start: number, deleteCount: number, ...items: any[]) {
      deleteCount && yo.delete(start, deleteCount)
      items?.length && yo.insert(start, items)
      return Array.prototype.splice.call(obj, start, deleteCount, ...items)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'shift', {
    value: function () {
      yo.delete(0, 1)
      return Array.prototype.shift.call(obj)
    },
    enumerable: false
  })

  Object.defineProperty(obj, 'pop', {
    value: function () {
      yo.delete(obj.length - 1, 1)
      return Array.prototype.pop.call(obj)
    },
    enumerable: false
  })

  return obj
}


