import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {CodeLineBlockModel} from "./index";

@Component({
  selector: 'div.code-line-block.edit-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeLineBlockComponent extends EditableBlockComponent<CodeLineBlockModel> {

  diffHighlight() {
    const isHere = this.doc.selection.value?.from.blockId === this.id
    let pos = 0
    if (isHere) {
      const sel = this.doc.selection.normalizeRange(document.getSelection()!.getRangeAt(0))
      pos = sel?.from.type === 'text' ? sel.from.index : 0
    }
    this.rerender()
    isHere && this.setInlineRange(pos)
  }
}
