import * as Y from 'yjs'
import {IBlockSnapshot} from "../types";
import {ReactiveMap} from "./map";
import {ErrorCode} from "../../global";
import {BlockCraftError} from "../../global";

function proxyArray(yarr: Y.Array<unknown>, ){

}

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

export type YBlock = Y.Map<unknown> & {
  get(prop: 'id'): string;
  get(prop: 'flavour'): string;
  get(prop: 'nodeType'): string;
  get(prop: 'props'): Y.Map<unknown>
  get(prop: 'meta'): Y.Map<unknown>
  get(prop: 'children'): Y.Array<string>;
  get<T = unknown>(prop: string): T;
};

export class ReactiveBlock<T extends IBlockSnapshot> {

  protected _yData!: YBlock

  props: ReactiveMap<T['props']> = ReactiveMap.fromNative(this._native['props'], this.controller)
  meta: ReactiveMap<T['meta']> = ReactiveMap.fromNative(this._native['meta'], this.controller)

  constructor(
    protected _native: T,
    public readonly controller: BlockCraft.Controller
  ) {
    this._yData = native2Y(this._native) as YBlock
  }

  get id() {
    return this._native.id
  }

  get flavour() {
    return this._native.flavour
  }

  get nodeType() {
    return this._native.nodeType
  }


}
