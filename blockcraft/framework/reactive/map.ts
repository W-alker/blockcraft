import * as Y from 'yjs'


export class ReactiveMap<T extends Record<string, unknown>>{

  constructor(
    private _native: T,
    protected _yData: Y.Map<any>,
    public readonly controller: BlockCraft.Controller
  ) {
  }

  get <K extends keyof T>(key: K) {
    return this._native[key]
  }

  static fromNative<T extends Record<string, unknown>>(native: T, controller: BlockCraft.Controller) {
    return new ReactiveMap(native, new Y.Map(Object.entries(native)), controller)
  }

  static fromYData<T extends Record<string, unknown>>(yData: Y.Map<any>, controller: BlockCraft.Controller) {

  }

  public set<K extends keyof T>(key: K, value: T[K]) {
    this._native[key] = value
  }


}
