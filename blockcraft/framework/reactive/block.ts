import * as Y from 'yjs'
import {IBlockSnapshot} from "../sync/types";

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

  constructor(
    protected _native: T,
    public readonly controller: BlockCraft.Controller
  ) {
  }

  get value(): Readonly<T> {
    return this._native
  }
}
