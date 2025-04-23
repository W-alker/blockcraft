import {ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent} from "../../../components";

@Component({
  selector: 'inline-link-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)">
      <bc-float-toolbar-item icon="bc_open-link" title="打开链接" name="open-link">打开链接</bc-float-toolbar-item>
      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item icon="bc_bianji" title="编辑链接" name="edit-link"></bc-float-toolbar-item>
      <bc-float-toolbar-item icon="bc_jiebang" title="解除链接" name="unbind-link"></bc-float-toolbar-item>
    </bc-float-toolbar>
  `,
  styles: [`
    :host {
      padding: 0 4px;
    }
  `],
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InlineLinkToolbar {

  @Output()
  itemClicked = new EventEmitter<BcFloatToolbarItemComponent>()

  constructor(
    public readonly destroyRef: DestroyRef
  ) {
  }

  onItemClick($event: BcFloatToolbarItemComponent) {
    this.itemClicked.emit($event)
  }
}
