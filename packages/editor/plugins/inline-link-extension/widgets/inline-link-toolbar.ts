import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";

@Component({
  selector: 'inline-link-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)">
      <bc-float-toolbar-item icon="bc_open-link" [title]="link" name="open-link">
        <span>{{ link }}</span>
      </bc-float-toolbar-item>
      <span class="bc-float-toolbar__divider"></span>
      @if (!doc.isReadonly) {
        <bc-float-toolbar-item icon="bc_bianji" title="编辑链接" name="edit-link"></bc-float-toolbar-item>
        <bc-float-toolbar-item icon="bc_jiebang" title="解除链接" name="unbind-link"></bc-float-toolbar-item>
      }
      <bc-float-toolbar-item icon="bc_fuzhi" title="复制链接" name="copy-link"></bc-float-toolbar-item>
      @if (!doc.isReadonly) {
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
                               [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">
          链接视图
        </bc-float-toolbar-item>
      }
    </bc-float-toolbar>

    <ng-template #viewModeTpl>
      <bc-float-toolbar direction="column" (onItemClick)="itemClicked.emit($event)">
        @for (mode of LINK_VIEW_MODE_MAP; track mode[0]) {
          <bc-float-toolbar-item [value]="mode[0]" name="switch-view" [active]="mode[0] === 'inline'">
            {{ mode[1] }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
      padding: 4px 0;

      [name="open-link"] {
        color: var(--bc-active-color);

        > span {
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  `],
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InlineLinkToolbar {
  @Input()
  doc!: BlockCraft.Doc

  @Input()
  link: string = ''

  @Output()
  itemClicked = new EventEmitter<BcFloatToolbarItemComponent>()

  protected readonly LINK_VIEW_MODE_MAP: Map<string, string> = new Map([['inline', '链接视图'], ['card', '卡片视图']])

  constructor(
    public readonly destroyRef: DestroyRef
  ) {
  }

  ngOnInit() {

  }

  onItemClick($event: BcFloatToolbarItemComponent) {
    this.itemClicked.emit($event)
  }

}
