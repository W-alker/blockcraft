import {IBlockFlavour} from "../../types";
import {Controller} from "../../controller";

type SelectionConstructor<T = unknown> = {
  type: BlockFlow.SelectionType;
  group: string;
  groupId: string;
  new(args: unknown): T;
};

export interface BaseSelectionOptions {
  group: string
  groupId: string
}

export interface IBaseSelectionJSON {
  type: BlockFlow.SelectionType,
  // this is meaning active focusing block or selection belong to which block\
  // if focusing at root element, this is 'root'
  group: IBlockFlavour
  groupId: string

  [key: string]: any
}

export abstract class BaseSelection {
  static readonly type: string;

  readonly group: string;
  readonly groupId: string;

  get type() {
    return (this.constructor as SelectionConstructor).type;
  }

  constructor({group, groupId}: BaseSelectionOptions) {
    this.group = group;
    this.groupId = groupId;
  }

  static fromJSON(_: Record<string, unknown>): BaseSelection {
    throw new Error('Method not implemented.');
  }

  static clearFromUI(this: { controller: Controller }, _: BaseSelection): void {
    throw new Error('Method not implemented.');
  }

  static renderToUI(this: { controller: Controller }, _: BaseSelection): void {
    throw new Error('Method not implemented.');
  }

  // abstract equals(other: BaseSelection): boolean;

  abstract toJSON(): IBaseSelectionJSON

}
