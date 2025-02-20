import {BaseSelection, BaseSelectionOptions, IBaseSelectionJSON} from "../base";
import {Controller} from "../../../controller";

interface IBlockSelectionJSON extends IBaseSelectionJSON {
  start: number
  end?: number
}

export class BlockSelection extends BaseSelection {
  static override type = 'block';

  readonly start: number
  readonly end: number;

  constructor(params: BaseSelectionOptions & { start: number, end?: number }) {
    super(params);
    this.start = params.start;
    this.end = params.end ?? params.start;
  }

  static override fromJSON(json: IBlockSelectionJSON): BlockSelection {
    return new BlockSelection(json);
  }

  static override renderToUI(this: { controller: Controller }, selection: BlockSelection) {
    const { start, end} = selection
    for (let i = start; i < end; i++) {
      const ele = this.controller.rootElement.children[i] as HTMLElement
      ele.firstElementChild!.classList.add('selected')
    }
  }

  static override clearFromUI(this: { controller: Controller }, selection: BlockSelection) {
    const { start, end} = selection
    for (let i = start; i < end; i++) {
      const ele = this.controller.rootElement.children[i] as HTMLElement
      ele.firstElementChild!.classList.remove('selected')
    }
  }

  // equals(other: BlockSelection): boolean {
  //   return false;
  // }

  toJSON(): IBlockSelectionJSON {
    return {
      type: 'block',
      group: this.group,
      groupId: this.groupId,
      start: this.start,
      end: this.end,
    }
  }

}
