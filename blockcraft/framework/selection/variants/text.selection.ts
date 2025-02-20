import {BaseSelection, BaseSelectionOptions, IBaseSelectionJSON} from "../base";
import {CharacterIndex} from "../type"
import {Controller} from "../../../controller";
import {setCharacterRange} from "../utils";

interface ITextSelectionJSON extends IBaseSelectionJSON {
  start: CharacterIndex,
  end: CharacterIndex
}

export class TextSelection extends BaseSelection {
  static override type = 'text';

  private readonly start: CharacterIndex
  private readonly end: CharacterIndex;

  constructor(params: BaseSelectionOptions & { start: CharacterIndex, end: CharacterIndex }) {
    super(params);
    this.start = params.start;
    this.end = params.end;
  }

  static override renderToUI(this: { controller: Controller }, selection: TextSelection) {
    const block = this.controller.getBlockRef(selection.groupId);
    if (!block || !this.controller.isEditableBlock(block))
      throw new Error(`Block ${selection.groupId} is not editable`)
    setCharacterRange(block.containerEle, selection.start, selection.end);
  }

  static override clearFromUI(this: { controller: Controller }, selection: TextSelection) {
    document.getSelection()?.removeAllRanges()
  }

  static override fromJSON(json: ITextSelectionJSON): TextSelection {
    return new TextSelection(json);
  }

  isCollapsed(): boolean {
    return this.start === this.end;
  }

  // equals(other: TextSelection): boolean {
  //   return false;
  // }

  toJSON(): ITextSelectionJSON {
    return {
      type: this.type,
      group: this.group,
      groupId: this.groupId,
      start: this.start,
      end: this.end
    }
  }

}
