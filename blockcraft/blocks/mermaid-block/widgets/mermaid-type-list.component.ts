import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent } from "../../../components";
import { MERMAID_TYPE_LIST } from "../const";
import { IMermaidType } from "../types";

@Component({
  selector: 'mermaid-type-list',
  template: `
    <bc-float-toolbar [theme]="theme" (onItemClick)="onItemClicked($event)" direction="column">
      @for (item of typeList; track item.name) {
        <bc-float-toolbar-item [name]="item.prefix">{{ item.name }}</bc-float-toolbar-item>
      }
    </bc-float-toolbar>
  `,
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MermaidTypeListComponent {
  protected typeList = MERMAID_TYPE_LIST

  @Input()
  theme = ''

  @Output()
  itemClicked = new EventEmitter<IMermaidType>()

  onItemClicked($event: BcFloatToolbarItemComponent) {
    this.itemClicked.emit(this.typeList.find(i => i.prefix === $event.name));
  }
}
