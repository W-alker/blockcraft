import {CdkMenu, CdkMenuItem} from '@angular/cdk/menu';
import {CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition} from '@angular/cdk/overlay';
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input, output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {CsIconComponent} from '@cses/ui';
import {generateId} from '../../framework/utils';
import type {ObjectContextMenuAction, ObjectContextMenuItem} from './object-menu';

@Component({
  selector: 'bc-editor-context-menu',
  standalone: true,
  imports: [CdkMenu, CdkMenuItem, CdkConnectedOverlay, CdkOverlayOrigin, CsIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div cdkMenu #mainMenu="cdkMenu" aria-label="编辑菜单" [attr.data-bc-context-menu]="menuId" (keydown.tab)="dismiss.emit()">
      <button cdkMenuItem [cdkMenuItemDisabled]="!hasSelection() || !writable()"
        [disabled]="!hasSelection() || !writable()" (mouseenter)="showFormats(false)"
        (cdkMenuItemTriggered)="action.emit('cut')">
        <cs-icon csType="cut" aria-hidden="true" /><span>剪切</span> <small>{{ shortcut() }}X</small></button>
      <button cdkMenuItem [cdkMenuItemDisabled]="!hasSelection()" [disabled]="!hasSelection()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('copy')">
        <cs-icon csType="copy" aria-hidden="true" /><span>复制</span> <small>{{ shortcut() }}C</small></button>
      <button cdkMenuItem [cdkMenuItemDisabled]="!pasteEnabled()" [disabled]="!pasteEnabled()"
        (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('paste')">
        <cs-icon csType="paste" aria-hidden="true" /><span>粘贴</span> <small>{{ shortcut() }}V</small></button>
      <button #pasteButton cdkMenuItem cdkOverlayOrigin #pasteOrigin="cdkOverlayOrigin"
        [hidden]="objectSelection()"
        [cdkMenuItemDisabled]="!formatsEnabled()" [disabled]="!formatsEnabled()"
        aria-haspopup="menu" [attr.aria-expanded]="formats"
        (mouseenter)="showFormats(true)" (keydown.arrowright)="enterFormats($event)"
        (cdkMenuItemTriggered)="showFormats(true)">
        <cs-icon csType="paste-two" aria-hidden="true" /><span>粘贴为</span>
        <cs-icon csType="arrow-right" aria-hidden="true" /></button>
      <div class="separator" role="separator"></div>
      @if (shapePointsEnabled()) {
        <button cdkMenuItem class="shape-point-action" (mouseenter)="showFormats(false)"
          (cdkMenuItemTriggered)="action.emit(shapePointsEditing() ? 'finish-shape-points' : 'edit-shape-points')">
          <span>{{ shapePointsEditing() ? '完成顶点编辑' : '编辑顶点' }}</span>
        </button>
        <div class="separator" role="separator"></div>
      }
      @for (item of objectItems(); track item.id) {
        @if (item.separatorBefore) { <div class="separator" role="separator"></div> }
        <button #objectButton cdkMenuItem cdkOverlayOrigin #objectOrigin="cdkOverlayOrigin"
          [cdkMenuItemDisabled]="!!item.disabled" [disabled]="!!item.disabled" [class.danger]="item.danger"
          [attr.aria-haspopup]="item.children ? 'menu' : null"
          [attr.aria-expanded]="item.children ? objectMenuId === item.id : null"
          (mouseenter)="showObjectMenu(item)" (keydown.arrowright)="enterObjectMenu($event, item, objectButton)"
          (cdkMenuItemTriggered)="triggerObjectItem(item)">
          <i class="bc_icon menu-icon" [class]="'bc_icon menu-icon ' + (item.icon ?? '')" aria-hidden="true"></i>
          <span>{{ item.label }}</span>
          @if (item.shortcut) { <small>{{ shortcut() }}{{ item.shortcut }}</small> }
          @if (item.children) { <cs-icon csType="arrow-right" aria-hidden="true" /> }
        </button>
        @if (item.children) {
          <ng-template cdkConnectedOverlay #objectOverlay="cdkConnectedOverlay" [cdkConnectedOverlayOrigin]="objectOrigin"
            [cdkConnectedOverlayOpen]="objectMenuId === item.id" [cdkConnectedOverlayPositions]="positions"
            [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
            (attach)="focusObjectMenuIfNeeded(objectOverlay, item.id)">
            <div cdkMenu #objectSubmenu="cdkMenu" [attr.aria-label]="item.label" [attr.data-bc-context-menu]="menuId"
              class="object-submenu" (mousedown)="$event.preventDefault(); $event.stopPropagation()"
              (contextmenu)="$event.preventDefault()" (keydown.arrowleft)="leaveObjectMenu($event, objectButton)"
              (keydown.tab)="dismiss.emit()">
              @for (child of item.children; track child.id) {
                @if (child.separatorBefore) { <div class="separator" role="separator"></div> }
                <button cdkMenuItem [cdkMenuItemDisabled]="!!child.disabled" [disabled]="!!child.disabled"
                  [class.active]="child.active" [attr.aria-current]="child.active ? 'true' : null"
                  (cdkMenuItemTriggered)="triggerObjectItem(child)">
                  <i [class]="'bc_icon menu-icon ' + (child.icon ?? '')" aria-hidden="true"></i><span>{{ child.label }}</span>
                  @if (child.active) { <i class="bc_icon bc_xuanzhong menu-check" aria-hidden="true"></i> }
                </button>
              }
            </div>
          </ng-template>
        }
      }
      @if (objectItems().length) { <div class="separator" role="separator"></div> }
      <button cdkMenuItem (mouseenter)="showFormats(false)" (cdkMenuItemTriggered)="action.emit('select-all')">
        <cs-icon csType="select-all" aria-hidden="true" /><span>全选</span> <small>{{ shortcut() }}A</small></button>
    </div>
    <ng-template cdkConnectedOverlay #formatsOverlay="cdkConnectedOverlay" [cdkConnectedOverlayOrigin]="pasteOrigin"
      [cdkConnectedOverlayOpen]="formats" [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
      (attach)="focusFormatsIfNeeded()">
      <div cdkMenu #formatMenu="cdkMenu" aria-label="粘贴为" [attr.data-bc-context-menu]="menuId"
        (mousedown)="$event.preventDefault(); $event.stopPropagation()" (contextmenu)="$event.preventDefault()"
        (keydown.arrowleft)="leaveFormats($event)" (keydown.tab)="dismiss.emit()">
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('paste')">
          <span>保留格式</span></button>
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('plain-text')">
          <span>纯文本</span></button>
        <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('markdown')">
          <span>Markdown</span></button>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; user-select: none; }
    [cdkMenu] { display: flex; flex-direction: column; box-sizing: border-box; min-width: 180px; padding: 4px;
      max-height: calc(100vh - 16px); overflow-y: auto;
      border-radius: var(--bc-radius-lg); border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-elevated); color: var(--bc-color); user-select: none;
      box-shadow: var(--bc-shadow-md); font-size: var(--bc-fs-sm); }
    [cdkMenu][aria-label="粘贴为"] { min-width: 156px; }
    button { display: flex; align-items: center; gap: 8px;
      border: 0; border-radius: 4px; padding: 6px 8px; background: transparent;
      color: inherit; font: inherit; text-align: left; cursor: pointer; outline: none; }
    button[hidden] { display: none; }
    button:hover:not(:disabled), button:focus-visible, button[aria-expanded="true"] { background: var(--bc-bg-hover); }
    button:focus-visible { box-shadow: inset 0 0 0 1px var(--bc-active-color); }
    button.danger { color: var(--bc-error-color); }
    button.active, .menu-check { color: var(--bc-active-color); }
    button.shape-point-action { padding-inline-start: 32px; }
    button:disabled { color: var(--bc-color-lighter); cursor: default; }
    button > cs-icon { flex: 0 0 16px; width: 16px; font-size: var(--bc-fs); line-height: 1; text-align: center; }
    .menu-icon { flex: 0 0 16px; width: 16px; font-size: var(--bc-fs); line-height: 1; text-align: center; }
    .menu-check { font-size: var(--bc-fs-sm); }
    .object-submenu { min-width: 172px; }
    button[aria-haspopup] > cs-icon:last-child { font-size: var(--bc-fs-sm); }
    button > span { flex: 1; white-space: nowrap; }
    small { color: var(--bc-color-light); font: inherit; white-space: nowrap; }
    button:disabled small { color: inherit; }
    .separator { height: 1px; background: var(--bc-border-color); margin: 4px; }
  `],
  host: {'(mousedown)': '$event.preventDefault(); $event.stopPropagation()', '(contextmenu)': '$event.preventDefault()'},
})
export class EditorContextMenuComponent {
  readonly hasSelection = input(false);
  readonly writable = input(false);
  readonly pasteEnabled = input(false);
  readonly formatsEnabled = input(false);
  readonly shapePointsEnabled = input(false);
  readonly shapePointsEditing = input(false);
  readonly objectItems = input<readonly ObjectContextMenuItem[]>([]);
  readonly objectSelection = input(false);
  readonly shortcut = input('Ctrl+');
  readonly action = output<'copy' | 'cut' | 'paste' | 'plain-text' | 'markdown' | 'select-all' | 'edit-shape-points' | 'finish-shape-points' | ObjectContextMenuAction>();
  readonly dismiss = output<void>();
  readonly menuId = generateId();
  readonly positions: ConnectedPosition[] = [
    {originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 2},
    {originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -2},
  ];
  @ViewChild('mainMenu') private mainMenu?: CdkMenu;
  @ViewChild('formatMenu') private formatMenu?: CdkMenu;
  @ViewChild('formatsOverlay') private formatOverlay?: CdkConnectedOverlay;
  @ViewChildren('objectSubmenu') private objectSubmenus?: QueryList<CdkMenu>;
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('pasteButton') private pasteButton?: ElementRef<HTMLButtonElement>;
  formats = false;
  private keyboardFormats = false;
  objectMenuId: string | null = null;
  private keyboardObjectMenu = false;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly cdr: ChangeDetectorRef) {}

  showFormats(value: boolean) {
    this.objectMenuId = null;
    this.keyboardObjectMenu = false;
    this.formats = value && this.formatsEnabled();
    if (this.formats && this.element.nativeElement.ownerDocument.activeElement === this.pasteButton?.nativeElement) {
      this.keyboardFormats = true;
      this.focusFormatsIfNeeded();
    }
    this.cdr.markForCheck();
  }

  showObjectMenu(item?: ObjectContextMenuItem) {
    this.formats = false;
    this.keyboardFormats = false;
    this.objectMenuId = item?.children?.length ? item.id : null;
    this.cdr.markForCheck();
  }

  triggerObjectItem(item: ObjectContextMenuItem) {
    if (item.disabled) return;
    if (item.action) this.action.emit(item.action);
    else this.showObjectMenu(item);
  }

  enterObjectMenu(event: Event, item: ObjectContextMenuItem, button: HTMLElement) {
    if (!item.children?.length || item.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    this.keyboardObjectMenu = true;
    this.showObjectMenu(item);
    if (button.ownerDocument.activeElement !== button) button.focus({preventScroll: true});
    queueMicrotask(() => this.focusObjectMenu());
  }

  leaveObjectMenu(event: Event, button: HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    this.objectMenuId = null;
    this.keyboardObjectMenu = false;
    button.focus({preventScroll: true});
    this.cdr.markForCheck();
  }

  focusObjectMenuIfNeeded(overlay: CdkConnectedOverlay, id: string) {
    if (overlay.overlayRef) overlay.overlayRef.hostElement.style.zIndex = '1001';
    queueMicrotask(() => { if (this.objectMenuId === id) this.focusObjectMenu(); });
  }

  private focusObjectMenu() {
    if (this.destroyRef.destroyed || !this.keyboardObjectMenu || !this.objectMenuId || !this.objectSubmenus?.last) return;
    this.keyboardObjectMenu = false;
    this.objectSubmenus.last.focusFirstItem('keyboard');
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
