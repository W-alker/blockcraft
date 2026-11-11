import {Subject, Subscription, takeUntil, skip} from 'rxjs';
import {DocPlugin, isNativeInputTarget, closetBlockId, BindHotKey, type UIEventStateContext} from '../../framework';
import {caretRangeFromPoint} from '../../framework/utils/caret-from-point';
import {
  captureRelativeSelectionBookmark, RelativeSelectionBookmark, resolveRelativeSelectionBookmark,
} from '../../framework/modules/selection/relative-bookmark';
import {EditorContextMenuComponent} from './menu.component';
import type {ShapeBlockComponent} from '../../blocks/shape-block';
import {ObjectContextMenuController, type ObjectContextMenuAction, type ObjectMenuContext} from './object-menu';

/** Editor-owned context menu; native form controls retain their existing handling. */
export class ContextMenuPlugin extends DocPlugin {
  override name = 'context-menu';
  private subscriptions = new Subscription();
  private close$?: Subject<void>;
  private destroyed = false;
  private busy = false;
  private objects?: ObjectContextMenuController;

  private get objectMenu() {
    return this.objects ||= new ObjectContextMenuController(this.doc);
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
    const block = this.doc.getBlockById(id);
    // Object surfaces own their menu target; existing multi-object/text ranges
    // keep their model scope, and a text range inside the object stays text.
    if (current && (!current.isInSameBlock || (this.doc.placement.getAbsoluteObjectSelectionIds(current)?.length ?? 0) > 1)) return;
    const object = this.objectMenu.target(block, current) ?? this.shapeForBlock(block);
    if (object) {
      if (!current || (current.firstBlock.id !== object.id && current.firstBlock.id !== block.id) ||
        (block === object && !this.doc.isEditable(block) && current.anchor.type !== 'selected')) {
        this.doc.selection.selectBlock(object);
      }
      return;
    }
    // Opening a context menu does not constitute a new selection gesture.
    // Only resolve a target when the editor has no existing caret or range.
    if (current) return;
    const native = target.ownerDocument.getSelection();
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
    const pointShape = this.resolvePointShape(selection);
    componentRef.setInput('shapePointsEnabled', writable && !!pointShape?.canEditPoints);
    componentRef.setInput('shapePointsEditing', !!pointShape?.isEditingPoints);
    const objectContext = this.objectMenu.resolve(selection);
    componentRef.setInput('objectItems', this.objectMenu.items(objectContext));
    componentRef.setInput('objectSelection', !!objectContext?.whole);
    const textTarget = selection.start.type === 'text' || selection.start.type === 'gap';
    componentRef.setInput('pasteEnabled', writable && (textTarget || this.doc.placement.isAbsoluteObjectSelection(selection)));
    componentRef.setInput('formatsEnabled', writable && textTarget);
    componentRef.setInput('shortcut', /Mac|iPhone|iPad/.test(owner.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl+');
    componentRef.instance.action.subscribe(action => { void this.execute(action, bookmark, objectContext); });
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

  private resolvePointShape(selection: BlockCraft.Selection | null): ShapeBlockComponent | null {
    if (!selection?.isInSameBlock) return null;
    const block = this.doc.vm.get(selection.firstBlock.id)?.instance;
    return block ? this.shapeForBlock(block) : null;
  }

  private shapeForBlock(block: BlockCraft.BlockComponent): ShapeBlockComponent | null {
    if (block.flavour === 'shape') return block as ShapeBlockComponent;
    if (block.flavour !== 'shape-text') return null;
    const parentId = this.doc.model.getParentId(block.id);
    const parent = parentId ? this.doc.vm.get(parentId)?.instance : null;
    return parent?.flavour === 'shape' ? parent as ShapeBlockComponent : null;
  }

  @BindHotKey({key: 'Escape'}, {flavour: 'shape'})
  onShapePointsEscape(ctx: UIEventStateContext): true | void {
    const shape = this.resolvePointShape(ctx.get('keyboardState').selection);
    if (!shape?.isEditingPoints) return;
    ctx.preventDefault();
    shape.setPointEditing(false);
    return true;
  }

  private async execute(action: 'copy' | 'cut' | 'paste' | 'plain-text' | 'markdown' | 'select-all' | 'edit-shape-points' | 'finish-shape-points' | ObjectContextMenuAction, bookmark: RelativeSelectionBookmark, objectContext?: ObjectMenuContext | null) {
    if (this.busy || this.destroyed) return;
    this.close();
    if (action === 'select-all') {
      this.doc.selection.selectAllChildren(this.doc.root);
      return;
    }
    const json = resolveRelativeSelectionBookmark(bookmark, this.doc);
    if (!json) {
      if (action.startsWith('object-')) this.doc.messageService.warn('对象已变化，请重新选择后操作');
      return;
    }
    this.doc.selection.replay(json);
    if (action.startsWith('object-')) {
      this.busy = true;
      try {
        const success = objectContext && await this.objectMenu.execute(action as ObjectContextMenuAction, objectContext);
        if (!success && !this.destroyed) this.doc.messageService.warn('对象已变化、被锁定或不支持此操作，请重新选择');
      } catch (error) {
        this.doc.logger.warn('context-menu object command failed', error);
        if (!this.destroyed) this.doc.messageService.warn('无法执行对象操作，请检查对象是否可编辑');
      } finally { this.busy = false; }
      return;
    }
    if (action === 'edit-shape-points' || action === 'finish-shape-points') {
      const shape = this.resolvePointShape(this.doc.selection.value);
      if (!shape || this.doc.isReadonly || shape.isReadonly) return;
      this.doc.root.hostElement.focus({preventScroll: true});
      this.doc.selection.selectBlock(shape.id);
      shape.setPointEditing(action === 'edit-shape-points');
      return;
    }
    this.busy = true;
    try {
      const selection = this.doc.selection.createSelection(json);
      if (!selection) return;
      const success = action === 'copy' || action === 'cut'
        ? await this.doc.clipboard.copySelectionToClipboard(selection, action === 'cut')
        : await this.doc.clipboard.pasteFromClipboard(selection, action === 'plain-text' ? 'plain-text' : action === 'markdown' ? 'markdown' : 'auto');
      if (!success && !this.destroyed) this.doc.messageService.warn('当前位置或剪贴板内容不支持此操作');
    } catch (error) {
      this.doc.logger.warn('context-menu clipboard command failed', error);
      if (!this.destroyed) this.doc.messageService.warn(action === 'copy' || action === 'cut'
        ? '无法写入剪贴板，请使用系统复制或剪切快捷键'
        : '无法读取剪贴板，请允许剪贴板访问或使用系统粘贴快捷键');
    } finally { this.busy = false; }
  }
}
