import * as Y from 'yjs'

export class ReactiveMap<T extends Record<string, unknown>> {
  private _yData: Y.Map<T> = new Y.Map(
    Object.entries(this._native)
  )

  constructor(
    private _native: T
  ) {
  }

  get value(): Readonly<T> {
    return this._native
  }

  public set<K extends keyof T>(key: K, value: T[K]) {
    this._native[key] = value
  }

  public get<K extends keyof T>(key: K) {
    return this._native[key]
  }
}
