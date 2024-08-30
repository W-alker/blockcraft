import {IBlockProps, SimpleRecord} from "@core/types";
import Y from "@core/yjs";

export const syncChangeMap = <T extends SimpleRecord>(obj: T, yObj: Y.Map<any>): T => {
    return new Proxy(obj, {
      set(target, prop, value) {
        console.log('set', prop, value)
        if (typeof prop === 'symbol') throw TypeError('key cannot be a symbol')
        yObj.set(prop, value)
        return Reflect.set(target, prop, value)
      },
      deleteProperty(target: IBlockProps, p): boolean {
        if (typeof p === 'symbol') throw TypeError('You try to delete a symbol property, which is not allowed.')
        yObj.delete(p)
        return Reflect.deleteProperty(target, p)
      }
    })
}

/**
 * @desc sync change of array, this method will return the input original array modified
 * @desc but don`t use 'sort' or 'reverse' method, because it will cause the yjs array out of sync
 */
export const syncChangeArray = (obj: any[], yObj: Y.Array<any>) => {
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


