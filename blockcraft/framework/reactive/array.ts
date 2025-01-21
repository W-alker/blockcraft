import * as Y from 'yjs'
import {BaseReactive} from "./base";

export class ReactiveArray<T extends unknown[]> extends BaseReactive<T> {
  private _yData!: Y.Array<T>

  override _init() {
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
