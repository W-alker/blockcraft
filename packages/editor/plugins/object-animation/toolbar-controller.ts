import {FlexibleConnectedPositionStrategy} from '@angular/cdk/overlay';
import {Subject, Subscription} from 'rxjs';
import {getPositionWithOffset} from '../../framework';
import {ObjectAnimationToolbarComponent} from './toolbar.component';
import {isObjectToolbarOwnedTarget} from '../object-layout/object-toolbar-interaction';

/** Fixed targets are held only for the lifetime of this settings panel. */
export class ObjectAnimationToolbarController {
  private overlay?: HTMLElement;
  private key = "";
  owns(target: Element | null): boolean { return isObjectToolbarOwnedTarget(this.overlay, target); }
  private dispose?: () => void;
  constructor(private readonly doc: BlockCraft.Doc, private readonly onClose: () => void) {}
  get isOpen(): boolean { return !!this.dispose; }

  open(anchor: HTMLElement, ids: readonly string[]): void {
    const selectionKey = ids.join("\0");
    if (this.isOpen && selectionKey === this.key) return;
    this.close();
    if (!ids.length || this.doc.isReadonly || ids.some(id => !this.doc.objectAnimation.supports(id) || this.doc.readonlyManager.isReadonly(id))) return;
    const releaseLease = this.doc.virtualization.acquireBlockViewLease(ids);
    const close$ = new Subject<void>();
    const subscriptions = new Subscription();
    const releaseEditing = this.doc.objectAnimation.acquireEditingLease(ids);
    const releasePresentation = this.doc.selection.retainPresentation();
    const owner = anchor.ownerDocument;
    const {componentRef, overlayRef, updatePosition} = this.doc.overlayService.createConnectedOverlay<ObjectAnimationToolbarComponent>({
      target: this.doc.getBlockById(ids[0]), origin: anchor,
      clampTo: owner.documentElement,
      component: ObjectAnimationToolbarComponent,
      positions: [getPositionWithOffset('right-center', 10, 0), getPositionWithOffset('left-center', 10, 0)],
    }, close$, () => this.close());
    this.overlay = overlayRef.overlayElement;
    this.key = selectionKey;
    const strategy = overlayRef.getConfig().positionStrategy;
    if (strategy instanceof FlexibleConnectedPositionStrategy) {
      subscriptions.add(strategy.positionChanges.subscribe(change => componentRef.setInput("side", change.connectionPair.originX === "start" ? "left" : "right")));
    }
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return;
      frame = owner.defaultView!.requestAnimationFrame(() => { frame = undefined; updatePosition(); });
    });
    observer.observe(overlayRef.overlayElement);
    this.dispose = () => {
      this.overlay = undefined;
      this.key = "";
      subscriptions.unsubscribe();
      observer.disconnect();
      if (frame !== undefined) owner.defaultView!.cancelAnimationFrame(frame);
      close$.next();
      close$.complete();
      overlayRef.dispose();
      releasePresentation();
      releaseLease();
      if (!this.doc.isReadonly) this.doc.objectAnimation.stopPreview();
      releaseEditing();
      this.onClose();
    };
    subscriptions.add(componentRef.instance.confirmed.subscribe(() => { this.close(); this.doc.selection.blur(); }));
    componentRef.setInput('doc', this.doc);
    componentRef.setInput('blockIds', [...ids]);
    const validate = () => {
      if (this.doc.isReadonly || ids.some(id => !this.doc.model.exists(id) || this.doc.readonlyManager.isReadonly(id))) this.close();
    };
    subscriptions.add(this.doc.model.structureChange$.subscribe(validate));
    subscriptions.add(this.doc.readonlySwitch$.subscribe(validate));
    subscriptions.add(this.doc.readonlyManager.stateChange$.subscribe(validate));
    subscriptions.add(this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection) return;
      const current = this.doc.objectAnimation.getSelectionIds(selection);
      if (current.length !== ids.length || current.some(id => !ids.includes(id))) this.close();
    }));
    const pointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (isObjectToolbarOwnedTarget(overlayRef.overlayElement, target)) {
        // Native form focus must not retain an editable Range behind the panel.
        if (this.doc.selection.value) this.doc.selection.blur();
      } else if (!target || (!anchor.contains(target) && !target.closest("bc-object-group-toolbar"))) this.close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault(); this.close(); anchor.focus({preventScroll: true});
      }
    };
    owner.addEventListener('pointerdown', pointer, true);
    owner.addEventListener('keydown', key);
    subscriptions.add(() => {
      owner.removeEventListener('pointerdown', pointer, true);
      owner.removeEventListener('keydown', key);
    });
    componentRef.changeDetectorRef.detectChanges();
  }
  close(): void { const dispose = this.dispose; this.dispose = undefined; dispose?.(); }
}
