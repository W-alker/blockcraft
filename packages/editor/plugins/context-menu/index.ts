import {Subject, Subscription, takeUntil, skip} from 'rxjs';
import {DocPlugin, isNativeInputTarget, closetBlockId} from '../../framework';
import {caretRangeFromPoint} from '../../framework/utils/caret-from-point';
import {
  captureRelativeSelectionBookmark, RelativeSelectionBookmark, resolveRelativeSelectionBookmark,
} from '../../framework/modules/selection/relative-bookmark';
import {EditorContextMenuComponent} from './menu.component';
import {CsModalService} from '@cses/ui';
import {TypographySettingsController} from '../fixed-toolbar/widgets/typography-settings-controller';

/** Editor-owned context menu; native form controls retain their existing handling. */
export class ContextMenuPlugin extends DocPlugin {
  override name = 'context-menu';
  private subscriptions = new Subscription();
  private close$?: Subject<void>;
  private destroyed = false;
  private busy = false;
  private settings?: TypographySettingsController;

  private get typographySettings() {
    return this.settings ||= new TypographySettingsController(this.doc, this.doc.injector.get(CsModalService, null));
  }

  init() {
    this.destroyed = false;
    this.doc.afterInit(root => {
      if (this.destroyed) return;
      const element = root.hostElement;
      const prepare = (event: MouseEvent) => {
        if (event.button !== 2 || !this.accepts(event)) return;
        this.selectTarget(event);
        event.preventDefault();
        event.stopPropagation();
      };
      element.addEventListener('mousedown', prepare, true);
      this.subscriptions.add(() => element.removeEventListener('mousedown', prepare, true));
      this.subscriptions.add(this.doc.event.customListen<MouseEvent>(element, 'contextmenu')
        .subscribe(event => this.open(event)));
    });
  }

  destroy() {
    this.destroyed = true;
    this.close();
    this.settings?.destroy();
    this.subscriptions.unsubscribe();
  }

  private accepts(event: MouseEvent) {
    return !this.busy && !this.doc.event.status.isComposing && !isNativeInputTarget(event.target) &&
      event.target instanceof Element && !event.target.closest('button,a,[role="button"],iframe');
  }

  private selectTarget(event: MouseEvent) {
    const target = event.target as Element;
    const id = closetBlockId(target);
    if (!id) return;
    const current = this.doc.selection.value;
    // Opening a context menu does not constitute a new selection gesture.
    // Only resolve a target when the editor has no existing caret or range.
    if (current) return;
    const native = target.ownerDocument.getSelection();
    const block = this.doc.getBlockById(id);
    if (block === this.doc.root) return;
    if (!this.doc.isEditable(block)) {
      this.doc.selection.selectBlock(block);
      return;
    }
    const range = caretRangeFromPoint(event.clientX, event.clientY);
    if (range && block.hostElement.contains(range.startContainer) && native) {
      native.removeAllRanges();
      native.addRange(range);
      this.doc.selection.recalculate();
    }
  }

  private open(event: MouseEvent) {
    if (!this.accepts(event)) return;
    if (event.clientX || event.clientY) this.selectTarget(event);
    const selection = this.doc.selection.value;
    const bookmark = captureRelativeSelectionBookmark(selection, this.doc);
    if (!selection || !bookmark) return;
    event.preventDefault();
    event.stopPropagation();
    // WebKit can select the word under a secondary click before contextmenu,
    // despite cancelling mousedown. Reassert the unchanged model range now.
    this.doc.selection.replay(selection.toJSON());
    this.close();
    const writable = !this.doc.isReadonly && !this.doc.readonlyManager.isSelectionReadonly(selection);
    const close$ = this.close$ = new Subject<void>();
    const owner = this.doc.root.hostElement.ownerDocument;
    const {componentRef, overlayRef} = this.doc.overlayService.createGlobalOverlay<EditorContextMenuComponent>({
      component: EditorContextMenuComponent, allowReadonly: true,
      left: `${event.clientX}px`, top: `${event.clientY}px`, backdrop: false,
    }, close$);
    // CDK selection toolbars use layer 1000 and may open after a debounce.
    // The active context menu must remain above them regardless of DOM order.
    overlayRef.hostElement.style.zIndex = '1001';
    componentRef.setInput('hasSelection', !selection.collapsed);
    componentRef.setInput('writable', writable);
    const hasSettings = !!this.doc.injector.get(CsModalService, null);
    componentRef.setInput('textSettingsEnabled', hasSettings && this.typographySettings.canSetFontScaleForSelection(selection));
    componentRef.setInput('paragraphSettingsEnabled', hasSettings && this.typographySettings.canSetParagraphSpacingForSelection(selection));
    const textTarget = selection.start.type === 'text' || selection.start.type === 'gap';
    componentRef.setInput('pasteEnabled', writable && (textTarget || this.doc.placement.isAbsoluteObjectSelection(selection)));
    componentRef.setInput('formatsEnabled', writable && textTarget);
    componentRef.setInput('shortcut', /Mac|iPhone|iPad/.test(owner.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl+');
    componentRef.instance.action.subscribe(action => { void this.execute(action, bookmark); });
    componentRef.instance.dismiss.subscribe(() => {
      this.close();
      this.doc.selection.restoreBookmark(bookmark);
    });
    componentRef.changeDetectorRef.detectChanges();
    // CDK positions the point origin and keeps the menu inside the viewport.
    overlayRef.updatePositionStrategy(this.doc.overlayService.overlay.position()
      .flexibleConnectedTo({x: event.clientX, y: event.clientY})
      .withPositions([
        {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'top'},
        {originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'bottom'},
      ]).withPush(true).withViewportMargin(8).withFlexibleDimensions(false));
    overlayRef.updatePosition();
    // Pointer menus keep editor focus and the real caret/range. Move focus only
    // when keyboard navigation starts; use the shared presentation for that interval.
    let presentation: ReturnType<typeof this.doc.selection.createFakeRange> | undefined;
    let releasePresentation: (() => void) | undefined;
    let focusFrame: number | undefined;
    const keydown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
        this.doc.selection.restoreBookmark(bookmark);
      } else if (!componentRef.instance.containsTarget(e.target)) {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const json = resolveRelativeSelectionBookmark(bookmark, this.doc);
          if (!json) { this.close(); return; }
          if (focusFrame !== undefined) return;
          releasePresentation = this.doc.selection.retainPresentation();
          presentation = this.doc.selection.createFakeRange(json,
            selection.collapsed ? {bgColor: 'var(--bc-caret-color)'} : {});
          // Finish the consumed contenteditable key event before moving focus.
          // WebKit otherwise restores editor focus after the menu has received it.
          focusFrame = owner.defaultView!.requestAnimationFrame(() => {
            focusFrame = undefined;
            componentRef.instance.focus(e.key === 'ArrowUp' || e.key === 'End');
          });
        } else {
          this.close();
        }
      }
    };
    owner.addEventListener('keydown', keydown, true);
    const dismiss = (e: Event) => {
      if (!componentRef.instance.containsTarget(e.target)) this.close();
    };
    owner.addEventListener('mousedown', dismiss, true);
    const scroll = (e: Event) => { if (!componentRef.instance.containsTarget(e.target)) this.close(); };
    owner.addEventListener('scroll', scroll, true);
    const onBlur = () => this.close();
    owner.defaultView?.addEventListener('blur', onBlur);
    this.doc.readonlySwitch$.pipe(skip(1), takeUntil(close$)).subscribe(() => this.close());
    close$.subscribe(() => {
      if (focusFrame !== undefined) owner.defaultView?.cancelAnimationFrame(focusFrame);
      presentation?.destroy();
      releasePresentation?.();
      owner.removeEventListener('keydown', keydown, true);
      owner.removeEventListener('mousedown', dismiss, true);
      owner.removeEventListener('scroll', scroll, true);
      owner.defaultView?.removeEventListener('blur', onBlur);
      if (this.close$ === close$) this.close$ = undefined;
    });
  }

  private close() {
    const close$ = this.close$;
    this.close$ = undefined;
    close$?.next();
    close$?.complete();
  }

  private async execute(action: 'copy' | 'cut' | 'paste' | 'plain-text' | 'markdown' | 'select-all' | 'text-settings' | 'paragraph-settings', bookmark: RelativeSelectionBookmark) {
    if (this.busy || this.destroyed) return;
    this.close();
    if (action === 'select-all') {
      this.doc.selection.selectAllChildren(this.doc.root);
      return;
    }
    const json = resolveRelativeSelectionBookmark(bookmark, this.doc);
    if (!json) return;
    this.doc.selection.replay(json);
    if (action === 'text-settings' || action === 'paragraph-settings') {
      if (action === 'text-settings') this.typographySettings.openFontSettings('font-size', json);
      else this.typographySettings.openParagraphSettings('paragraph-align', json);
      return;
    }
    this.busy = true;
    try {
      const selection = this.doc.selection.createSelection(json);
      if (!selection) return;
      const success = action === 'copy' || action === 'cut'
        ? await this.doc.clipboard.copySelectionToClipboard(selection, action === 'cut')
        : await this.doc.clipboard.pasteFromClipboard(selection, action === 'paste' ? 'auto' : action);
      if (!success && !this.destroyed) this.doc.messageService.warn('当前位置或剪贴板内容不支持此操作');
    } catch (error) {
      this.doc.logger.warn('context-menu clipboard command failed', error);
      if (!this.destroyed) this.doc.messageService.warn(action === 'copy' || action === 'cut'
        ? '无法写入剪贴板，请使用系统复制或剪切快捷键'
        : '无法读取剪贴板，请允许剪贴板访问或使用系统粘贴快捷键');
    } finally { this.busy = false; }
  }
}
