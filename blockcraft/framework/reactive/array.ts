import * as Y from 'yjs'

interface IReactiveArray<T extends unknown[]> {
  get(index: number): T[number]
}

export class ReactiveArray<T extends unknown[]> implements IReactiveArray<T> {

  constructor(
    protected _native: T,
    protected_yData: Y.Array<T>,
    public readonly controller: BlockCraft.Controller
  ) {
    // @ts-ignore
    this._yData = Y.Array.from(this._native)
  }

  public set(index: number, value: T[number]) {
    this._native[index] = value
  }

  public delete(index: number, count: number) {
    this._native.splice(index, count)
  }

  public push(...values: T[number][]) {
    this._native.push(...values)
  }

  public unshift(...values: T[number][]) {
    this._native.unshift(...values)
  }

  public insert(index: number, ...values: T[number][]) {
    this._native.splice(index, 0, ...values)
  }

}
