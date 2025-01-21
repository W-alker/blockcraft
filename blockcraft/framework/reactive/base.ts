import * as Y from 'yjs'

export class BaseReactive<T> {

  private _skipNext = false

  constructor(
    protected _native: T,
    public readonly controller: BlockCraft.Controller
  ) {
    this._init()
  }

  protected _init() {
  }

  protected _updateWithSkip(fn: () => void) {
    this._skipNext = true
    fn()
    this._skipNext = false
  }

  get value(): Readonly<T> {
    return this._native
  }
}
