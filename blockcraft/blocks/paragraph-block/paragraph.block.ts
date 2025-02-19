import {ChangeDetectionStrategy, Component} from "@angular/core";
import {ParagraphBlockModel} from "./index";
import {EditableBlockComponent} from "../../framework";

@Component({
  selector: 'p.paragraph-block',
  template: `
  `,
  styles: [``],
  standalone: true,
  host: {
    '[class.edit-container]': 'true',
    '[attr.contenteditable]': 'true'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParagraphBlockComponent extends EditableBlockComponent<ParagraphBlockModel> {

  onClick() {
    this.props['content'] = 'this is a paragraph block'
  }

  delete() {
    this.doc.crud.deleteBlocks(this.parentId!, 0)
  }

}
