import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, computed, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import {LinkBlockMenuState} from '../../link-view-utils';

@Component({
  selector: 'inline-link-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)">
      <bc-float-toolbar-item icon="bc_open-link" [title]="link" name="open-link">
        <span>{{ link }}</span>
      </bc-float-toolbar-item>
      <span class="bc-float-toolbar__divider"></span>
      @if (!isReadOnly) {
        <bc-float-toolbar-item icon="bc_bianji" title="编辑链接" name="edit-link"></bc-float-toolbar-item>
        <bc-float-toolbar-item icon="bc_jiebang" title="解除链接" name="unbind-link"></bc-float-toolbar-item>
      }
      <bc-float-toolbar-item icon="bc_fuzhi" title="复制链接" name="copy-link"></bc-float-toolbar-item>
      @if (!isReadOnly) {
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
                               [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">
          链接视图
        </bc-float-toolbar-item>
      }
    </bc-float-toolbar>

    <ng-template #viewModeTpl>
      <bc-float-toolbar direction="column" (onItemClick)="itemClicked.emit($event)">
        @if (blockView.loading()) {
          <bc-float-toolbar-item [disabled]="true">正在解析链接…</bc-float-toolbar-item>
        } @else if (blockView.failed()) {
          <bc-float-toolbar-item [disabled]="true">链接解析失败</bc-float-toolbar-item>
        }
        @for (mode of LINK_VIEW_MODE_MAP(); track mode[0]) {
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

  @Input()
  isReadOnly = false

  @Output()
  itemClicked = new EventEmitter<BcFloatToolbarItemComponent>()

  readonly blockView = new LinkBlockMenuState()
  protected readonly LINK_VIEW_MODE_MAP = computed(() => {
    const modes = new Map([['inline', '链接视图'], ['card', '卡片视图']])
    const target = this.blockView.target()
    if (target) modes.set('embed', target.label)
    return modes
  })

  constructor(
    public readonly destroyRef: DestroyRef
  ) {
  }

  ngOnChanges() {
    if (this.doc && !this.isReadOnly && !this.doc.isReadonly) this.blockView.load(this.link, this.doc)
    else this.blockView.cancel()
  }

  ngOnDestroy() { this.blockView.cancel() }

  onItemClick($event: BcFloatToolbarItemComponent) {
    this.itemClicked.emit($event)
  }

}
