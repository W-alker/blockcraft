import {ChangeDetectionStrategy, Component, EventEmitter, Output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent} from "../../../components";
import {IMermaidType, MermaidViewMode} from "../types";

@Component({
  selector: 'mermaid-type-list',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked($event)" direction="column">
      @for (item of viewModes; track item) {
        <bc-float-toolbar-item [name]="item">{{ viewModeMap[item] }}</bc-float-toolbar-item>
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
export class MermaidViewSwitchComponent {
  @Output()
  itemClicked = new EventEmitter<MermaidViewMode>()

  viewModes: MermaidViewMode[] = ['text', 'graph', 'default'];

  viewModeMap = {
    'text': '仅文本',
    'graph': '仅预览',
    'default': '文本与预览'
  }

  onItemClicked($event: BcFloatToolbarItemComponent) {
    this.itemClicked.emit($event.name as MermaidViewMode);
  }
}
