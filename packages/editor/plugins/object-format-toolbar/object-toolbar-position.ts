import {NgZone} from '@angular/core';
import {FlexibleConnectedPositionStrategy, type ConnectedPosition, type OverlayRef} from '@angular/cdk/overlay';
import {type Observable, Subscription, take} from 'rxjs';
import {getPositionWithOffset} from '../../framework/angular/overlay.service';

type Side = 'right' | 'left' | 'top' | 'bottom';
type Bounds = {left: number; top: number; right: number; bottom: number};
const MARGIN = 8;
const GAP = 8;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
const style = (element: HTMLElement, key: string, value: string) => {
  if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
};

/** Rail-only CDK geometry. Secondary cards remain in the owner's DOM/focus boundary. */
export function positionObjectToolbar(options: {
  zone: NgZone;
  overlayRef: OverlayRef;
  updatePosition: () => void;
  origin: HTMLElement;
  getOriginRect?: () => DOMRect;
  boundary?: HTMLElement;
  close$: Observable<unknown>;
  gap?: number;
}): () => void {
  if (NgZone.isInAngularZone()) {
    return options.zone.runOutsideAngular(() => positionObjectToolbar(options));
  }
  const {overlayRef, origin, close$} = options;
  const strategy = overlayRef.getConfig().positionStrategy;
  const view = origin.ownerDocument.defaultView;
  if (!(strategy instanceof FlexibleConnectedPositionStrategy) || !view) return () => undefined;
  const pane = overlayRef.overlayElement;
  const blockHost = origin.closest('[data-block-id]') ?? origin;
  const subscriptions = new Subscription();
  let frame: number | undefined;
  let disposed = false;
  let positioning = false;
  let observedPanel: HTMLElement | undefined;
  let expandedSizes: {vertical: DOMRect; horizontal: DOMRect} | undefined;
  // Only this family has absolutely positioned, independently fitted cards.
  pane.setAttribute('data-bc-object-toolbar-overlay', '');
  const bounds = (): Bounds => {
    const viewport = view.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const element = options.boundary;
    const rect = element?.getBoundingClientRect();
    const scaleX = element?.offsetWidth && rect ? rect.width / element.offsetWidth : 1;
    const scaleY = element?.offsetHeight && rect ? rect.height / element.offsetHeight : 1;
    const owner = element && rect ? {
      left: rect.left + element.clientLeft * scaleX, top: rect.top + element.clientTop * scaleY,
      right: rect.left + (element.clientLeft + element.clientWidth) * scaleX,
      bottom: rect.top + (element.clientTop + element.clientHeight) * scaleY,
    } : undefined;
    return {
      left: Math.max(left, owner?.left ?? left) + MARGIN,
      top: Math.max(top, owner?.top ?? top) + MARGIN,
      right: Math.min(left + (viewport?.width ?? origin.ownerDocument.documentElement.clientWidth), owner?.right ?? Infinity) - MARGIN,
      bottom: Math.min(top + (viewport?.height ?? origin.ownerDocument.documentElement.clientHeight), owner?.bottom ?? Infinity) - MARGIN,
    };
  };
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    options.zone.runOutsideAngular(() => {
      frame = view.requestAnimationFrame(() => { frame = undefined; position(); });
    });
  };
  const panelObserver = new ResizeObserver(schedule);
  const position = () => {
    if (!overlayRef.hasAttached() || !origin.isConnected) return;
    const shell = pane.querySelector<HTMLElement>('bc-floating-toolbar');
    if (!shell) return;
    shell.dataset['bcToolbarPlacement'] ??= 'right';
    const root = shell.querySelector<HTMLElement>('.object-format');
    const horizontal = (value: boolean) => {
      shell.toggleAttribute('data-bc-toolbar-horizontal', value);
      root?.toggleAttribute('data-bc-toolbar-horizontal', value);
    };
    const limit = bounds();
    const target = options.getOriginRect?.() ?? origin.getBoundingClientRect();
    if (limit.right <= limit.left || limit.bottom <= limit.top) return;
    // Measure both real CSS layouts, including custom actions and coarse-pointer sizes.
    // This runs only in coalesced geometry work, never in Angular's render path.
    if (root) {
      horizontal(false);
      const vertical = shell.getBoundingClientRect();
      horizontal(true);
      expandedSizes = {vertical, horizontal: shell.getBoundingClientRect()};
    }
    const current = shell.getBoundingClientRect();
    const clearance = {left: target.left, right: target.right, top: target.top, bottom: target.bottom};
    for (const element of Array.from(blockHost.querySelectorAll<HTMLElement>('.shape-resizer__handle, .shape-resizer__rotate'))) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      clearance.left = Math.min(clearance.left, rect.left);
      clearance.right = Math.max(clearance.right, rect.right);
      clearance.top = Math.min(clearance.top, rect.top);
      clearance.bottom = Math.max(clearance.bottom, rect.bottom);
    }
    const gap = options.gap ?? GAP;
    const candidates = (['right', 'left', 'top', 'bottom'] as const).map(side => {
      const size = expandedSizes?.[side === 'top' || side === 'bottom' ? 'horizontal' : 'vertical'] ?? current;
      let left = side === 'right' ? clearance.right + gap : side === 'left' ? clearance.left - gap - size.width : target.left;
      let top = side === 'top' ? clearance.top - gap - size.height : side === 'bottom' ? clearance.bottom + gap : target.top;
      // Cross-axis shifting does not cover the object; it just keeps the rail reachable.
      if (side === 'top' || side === 'bottom') left = clamp(left, limit.left, limit.right - size.width);
      else top = clamp(top, limit.top, limit.bottom - size.height);
      const visibleWidth = Math.max(0, Math.min(left + size.width, limit.right) - Math.max(left, limit.left));
      const visibleHeight = Math.max(0, Math.min(top + size.height, limit.bottom) - Math.max(top, limit.top));
      return {side, size, left, top, fits: visibleWidth >= size.width - .5 && visibleHeight >= size.height - .5,
        fraction: visibleWidth * visibleHeight / Math.max(1, size.width * size.height)};
    });
    const best = candidates.find(candidate => candidate.fits)
      ?? candidates.reduce((a, b) => b.fraction > a.fraction ? b : a);
    horizontal(best.side === 'top' || best.side === 'bottom');
    shell.dataset['bcToolbarPlacement'] = best.side;
    style(shell, 'max-width', `${limit.right - limit.left}px`);
    if (root) style(root, 'max-width', `${limit.right - limit.left}px`);
    // Collapsed bars use the expanded rectangle's start, avoiding a jump on toggle.
    const pair: ConnectedPosition = {...getPositionWithOffset('bottom-left'),
      originX: overlayRef.getDirection() === 'rtl' ? 'end' : 'start',
      overlayX: overlayRef.getDirection() === 'rtl' ? 'end' : 'start',
      offsetX: best.left - target.left,
      offsetY: best.top - target.bottom};
    strategy.withPositions([pair]);
    positioning = true;
    try { options.updatePosition(); } finally { positioning = false; }
    const panel = root?.querySelector<HTMLElement>('.object-format__panel');
    if (panel !== observedPanel) {
      panelObserver.disconnect();
      observedPanel = panel ?? undefined;
      if (observedPanel) panelObserver.observe(observedPanel);
    }
    if (!root || !panel) return;
    const rail = root.querySelector<HTMLElement>('.object-format__rail');
    if (!rail) return;
    const railRect = rail.getBoundingClientRect();
    style(panel, 'max-width', `${Math.max(0, limit.right - limit.left)}px`);
    style(panel, 'max-height', `${Math.max(0, Math.min(520, limit.bottom - limit.top))}px`);
    const card = panel.getBoundingClientRect();
    const order: Side[] = best.side === 'left' ? ['left', 'right', 'bottom', 'top']
      : best.side === 'top' ? ['top', 'bottom', 'right', 'left']
      : best.side === 'bottom' ? ['bottom', 'top', 'right', 'left'] : ['right', 'left', 'bottom', 'top'];
    const cards = order.map(side => {
      const width = side === 'left' ? railRect.left - GAP - limit.left : side === 'right' ? limit.right - railRect.right - GAP : limit.right - limit.left;
      const height = side === 'top' ? railRect.top - GAP - limit.top : side === 'bottom' ? limit.bottom - railRect.bottom - GAP : limit.bottom - limit.top;
      return {side, width: Math.max(0, width), height: Math.max(0, height),
        area: Math.min(card.width, Math.max(0, width)) * Math.min(card.height, Math.max(0, height))};
    });
    const chosen = cards.find(c => c.width >= card.width && c.height >= card.height)
      ?? cards.reduce((a, b) => b.area > a.area ? b : a);
    style(panel, 'max-width', `${chosen.width}px`);
    style(panel, 'max-height', `${Math.min(520, chosen.height)}px`);
    const fitted = panel.getBoundingClientRect();
    const left = chosen.side === 'left' ? railRect.left - GAP - fitted.width : chosen.side === 'right' ? railRect.right + GAP
      : clamp(railRect.left, limit.left, limit.right - fitted.width);
    const top = chosen.side === 'top' ? railRect.top - GAP - fitted.height : chosen.side === 'bottom' ? railRect.bottom + GAP
      : clamp(railRect.top, limit.top, limit.bottom - fitted.height);
    const base = root.getBoundingClientRect();
    const scaleX = root.offsetWidth ? base.width / root.offsetWidth : 1;
    const scaleY = root.offsetHeight ? base.height / root.offsetHeight : 1;
    style(panel, 'left', `${(left - base.left) / (scaleX || 1)}px`);
    style(panel, 'top', `${(top - base.top) / (scaleY || 1)}px`);
    style(panel, 'right', 'auto');
    panel.dataset['bcPanelPlacement'] = chosen.side;
    root.classList.toggle('object-format--left', chosen.side === 'left');
  };
  subscriptions.add(strategy.positionChanges.subscribe(() => { if (!positioning) schedule(); }));
  const observer = new ResizeObserver(schedule);
  observer.observe(pane);
  observer.observe(origin);
  if (options.boundary) observer.observe(options.boundary);
  const mutations = new MutationObserver(schedule);
  mutations.observe(pane, {childList: true, subtree: true});
  // Prop notifications may precede Angular's projected transform. Follow the
  // actual block styles too, so pure translations/rotations cannot keep stale offsets.
  const geometryObserver = new MutationObserver(schedule);
  geometryObserver.observe(blockHost, {attributes: true, attributeFilter: ['style'], subtree: true});
  const onScroll = (event: Event) => {
    if (event.target instanceof Node && event.target.contains(origin)) schedule();
  };
  origin.ownerDocument.addEventListener('scroll', onScroll, true);
  view.addEventListener('resize', schedule);
  view.visualViewport?.addEventListener('resize', schedule);
  view.visualViewport?.addEventListener('scroll', schedule);
  subscriptions.add(close$.pipe(take(1)).subscribe(() => {
    disposed = true;
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    observer.disconnect();
    panelObserver.disconnect();
    mutations.disconnect();
    geometryObserver.disconnect();
    origin.ownerDocument.removeEventListener('scroll', onScroll, true);
    view.removeEventListener('resize', schedule);
    view.visualViewport?.removeEventListener('resize', schedule);
    view.visualViewport?.removeEventListener('scroll', schedule);
    subscriptions.unsubscribe();
  }));
  schedule();
  return schedule;
}
