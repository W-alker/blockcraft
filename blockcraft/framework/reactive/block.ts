import * as Y from 'yjs'
import {BaseBlockDesc, BlockNodeType, IBlockProps, IEditableBlockProps, InlineModel} from "../types";
import {BlockCraftError, ErrorCode, UnknownRecord} from "../../global";
import {ORIGIN_SKIP_SYNC} from "../doc";

const native2Y = function (native: Object): Y.Map<any> | Y.Array<any> {
  if (typeof native !== 'object')
    throw new BlockCraftError(
      ErrorCode.ReactiveProxyError,
      'native2Y: native is not an object'
    )

  if (native instanceof Array) {
    const yarr = new Y.Array<unknown>()
    const arr = []
    for (const v of native) {
      if (v != null && typeof v === 'object') {
        arr.push(native2Y(v))
      }
      arr.push(v)
    }
    yarr.push(arr)
    return yarr
  }

  const map = new Y.Map()
  for (const key in native) {
    const v = native[key as keyof typeof native]
    if (v && typeof v === 'object') {
      map.set(key, native2Y(v))
    }
    map.set(key, v)
  }
  return map
}

export type Obj2YMap<T extends UnknownRecord> = Y.Map<unknown> & {
  get<K extends keyof T>(prop: K): T[K]
}

export type YBlock<N extends NativeBlockModel = NativeBlockModel> = Y.Map<unknown> & {
  get(prop: 'id'): string;
  get(prop: 'flavour'): N['flavour'];
  get(prop: 'nodeType'): N['nodeType']
  get(prop: 'props'): Obj2YMap<N['props']>
  get(prop: 'meta'): Obj2YMap<N['meta']>
  get(prop: 'children'): N['nodeType'] extends BlockNodeType.editable ? Y.Text : Y.Array<string>
  get<T = unknown>(prop: string): T;
}

export interface NoEditableBlockNative extends BaseBlockDesc {
  nodeType: BlockNodeType.void | BlockNodeType.block | BlockNodeType.root
  children: string[];
  props: IBlockProps
}

export interface EditableBlockNative extends BaseBlockDesc {
  nodeType: BlockNodeType.editable
  children: InlineModel
  props: IEditableBlockProps
}

export type NativeBlockModel = NoEditableBlockNative | EditableBlockNative

export function proxyMap<T extends UnknownRecord>(obj: T, yObj: Obj2YMap<T>): T {
  return new Proxy(obj, {
    set(target, prop: string, value) {
      yObj.doc?.transact(() => {
        yObj.set(prop, value)
        Reflect.set(target, prop, value)
      }, ORIGIN_SKIP_SYNC)
      return true
    },
    deleteProperty(target: T, p: string) {
      yObj.doc?.transact(() => {
        yObj.delete(p)
        Reflect.deleteProperty(target, p)
      }, ORIGIN_SKIP_SYNC)
      return true
    }
  })
}

export const native2YBlock = <T extends NativeBlockModel = NativeBlockModel>(native: T) => {
  let yChildren
  if (native.nodeType === BlockNodeType.editable) {
    yChildren = new Y.Text()
    native.children.length && yChildren.applyDelta(native.children)
  } else {
    yChildren = Y.Array.from(native.children)
  }

  const yProps = new Y.Map(Object.entries(native.props))
  const yMeta = new Y.Map(Object.entries(native.meta))

  return new Y.Map<any>([
    ['id', native.id],
    ['flavour', native.flavour],
    ['nodeType', native.nodeType],
    ['props', yProps],
    ['meta', yMeta],
    ['children', yChildren]
  ]) as YBlock<T>
}

export const yBlock2Native = <T extends NativeBlockModel = NativeBlockModel>(yBlock: YBlock<T>): T => {
  const nodeType = yBlock.get('nodeType')
  return {
    id: yBlock.get('id'),
    flavour: yBlock.get('flavour'),
    nodeType,
    props: yBlock.get('props').toJSON(),
    meta: yBlock.get('meta').toJSON(),
    children: nodeType === BlockNodeType.editable ? (yBlock.get('children') as Y.Text).toDelta() : (yBlock.get('children') as Y.Array<string>).toArray()
  } as T
}

