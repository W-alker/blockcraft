import {CdkMenu, CdkMenuItem} from '@angular/cdk/menu';
import {CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition} from '@angular/cdk/overlay';
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input, output, ViewChild} from '@angular/core';
import {generateId} from '../../framework/utils';

@Component({
  selector: 'bc-editor-context-menu',
  standalone: true,
  imports: [CdkMenu, CdkMenuItem, CdkConnectedOverlay, CdkOverlayOrigin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div cdkMenu #mainMenu="cdkMenu" aria-label="编辑菜单" [attr.data-bc-context-menu]="menuId" (keydown.tab)="dismiss.emit()">
      <button cdkMenuItem [cdkMenuItemDisabled]="!hasSelection() || !writable()"
        [disabled]="!hasSelection() || !writable()" (mouseenter)="showFormats(false)"
        (cdkMenuItemTriggered)="action.emit('cut')">剪切 <span>{{ shortcut() }}X</span></button>
      <button cdkMenuItem [cdkMenuItemDisabled]="!hasSelection()" [disabled]="!hasSelection()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('copy')">复制 <span>{{ shortcut() }}C</span></button>
      <button cdkMenuItem [cdkMenuItemDisabled]="!pasteEnabled()" [disabled]="!pasteEnabled()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('paste')">粘贴 <span>{{ shortcut() }}V</span></button>
      <button #pasteButton cdkMenuItem cdkOverlayOrigin #pasteOrigin="cdkOverlayOrigin"
        [cdkMenuItemDisabled]="!formatsEnabled()" [disabled]="!formatsEnabled()"
        aria-haspopup="menu" [attr.aria-expanded]="formats"
        (mouseenter)="showFormats(true)" (keydown.arrowright)="enterFormats($event)"
        (cdkMenuItemTriggered)="showFormats(true)">粘贴为 <span>›</span></button>
      <div class="separator" role="separator"></div>
      <button cdkMenuItem [cdkMenuItemDisabled]="!textSettingsEnabled()" [disabled]="!textSettingsEnabled()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('text-settings')">文本设置</button>
      <button cdkMenuItem [cdkMenuItemDisabled]="!paragraphSettingsEnabled()" [disabled]="!paragraphSettingsEnabled()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('paragraph-settings')">段落设置</button>
      <div class="separator" role="separator"></div>
      <button cdkMenuItem (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('select-all')">全选 <span>{{ shortcut() }}A</span></button>
    </div>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="pasteOrigin"
      [cdkConnectedOverlayOpen]="formats" [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
      (attach)="focusFormatsIfNeeded()">
      <div cdkMenu #formatMenu="cdkMenu" aria-label="粘贴为" [attr.data-bc-context-menu]="menuId"
        (mousedown)="$event.preventDefault(); $event.stopPropagation()" (contextmenu)="$event.preventDefault()"
        (keydown.arrowleft)="leaveFormats($event)" (keydown.tab)="dismiss.emit()">
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('paste')">保留格式</button>
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('plain-text')">纯文本</button>
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('markdown')">Markdown</button>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; user-select: none; }
    [cdkMenu] { display: flex; flex-direction: column; min-width: 210px; padding: 4px;
      border-radius: var(--bc-radius-lg); border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-elevated); color: var(--bc-color); user-select: none;
      box-shadow: var(--bc-shadow-md); font-size: var(--bc-fs-sm); }
    button { display: flex; align-items: center; justify-content: space-between; gap: 24px;
      border: 0; border-radius: 4px; padding: 7px 12px; background: transparent;
      color: inherit; font: inherit; text-align: left; cursor: pointer; outline: none; }
    button:hover:not(:disabled), button:focus-visible, button[aria-expanded="true"] { background: var(--bc-bg-hover); }
    button:disabled { color: var(--bc-color-lighter); cursor: default; }
    span { color: var(--bc-color-light); }
    .separator { height: 1px; background: var(--bc-border-color); margin: 4px; }
  `],
  host: {'(mousedown)': '$event.preventDefault(); $event.stopPropagation()', '(contextmenu)': '$event.preventDefault()'},
})
export class EditorContextMenuComponent {
  readonly hasSelection = input(false);
  readonly writable = input(false);
  readonly pasteEnabled = input(false);
  readonly formatsEnabled = input(false);
  readonly textSettingsEnabled = input(false);
  readonly paragraphSettingsEnabled = input(false);
  readonly shortcut = input('Ctrl+');
  readonly action = output<'copy' | 'cut' | 'paste' | 'plain-text' | 'markdown' | 'select-all' | 'text-settings' | 'paragraph-settings'>();
  readonly dismiss = output<void>();
  readonly menuId = generateId();
  readonly positions: ConnectedPosition[] = [
    {originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 2},
    {originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -2},
  ];
  @ViewChild('mainMenu') private mainMenu?: CdkMenu;
  @ViewChild('formatMenu') private formatMenu?: CdkMenu;
  @ViewChild(CdkConnectedOverlay) private formatOverlay?: CdkConnectedOverlay;
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('pasteButton') private pasteButton?: ElementRef<HTMLButtonElement>;
  formats = false;
  private keyboardFormats = false;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly cdr: ChangeDetectorRef) {}

  showFormats(value: boolean) {
    this.formats = value && this.formatsEnabled();
    if (this.formats && this.element.nativeElement.ownerDocument.activeElement === this.pasteButton?.nativeElement) {
      this.keyboardFormats = true;
      this.focusFormatsIfNeeded();
    }
    this.cdr.markForCheck();
  }

  enterFormats(event: Event) {
    event.preventDefault();
    this.keyboardFormats = true;
    this.showFormats(true);
    this.focusFormatsIfNeeded();
  }

  leaveFormats(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.showFormats(false);
    this.pasteButton?.nativeElement.focus({preventScroll: true});
  }

  focusFormatsIfNeeded() {
    if (this.formatOverlay?.overlayRef) this.formatOverlay.overlayRef.hostElement.style.zIndex = '1001';
    if (!this.keyboardFormats) return;
    // The attached template must finish its CDK content initialization first.
    queueMicrotask(() => {
      if (this.destroyRef.destroyed || !this.keyboardFormats || !this.formatMenu) return;
      this.keyboardFormats = false;
      this.formatMenu.focusFirstItem('keyboard');
    });
  }

  containsTarget(target: EventTarget | null) {
    return target instanceof Element && target.closest(`[data-bc-context-menu="${this.menuId}"]`) !== null;
  }

  focus(last = false) {
    if (last) this.mainMenu?.focusLastItem('keyboard');
    else this.mainMenu?.focusFirstItem('keyboard');
  }
}
