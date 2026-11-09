import { ComponentRef } from '@angular/core';
import {
  ComponentType,
  ConnectedPosition,
  FlexibleConnectedPositionStrategy,
  Overlay,
  OverlayRef,
  PositionStrategy,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { filter, fromEvent, merge, Subject, take, takeUntil } from 'rxjs';
import { throttle } from '../../global';

// export const DOC_OVERLAY_SERVICE_TOKEN = new InjectionToken<OverlayService>('DOC_OVERLAY_SERVICE');

export const POSITION_MAP: Record<OverlayPosition, ConnectedPosition> = {
  'top-left': {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
  },
  'top-center': {
    originX: 'center',
    originY: 'top',
    overlayX: 'center',
    overlayY: 'bottom',
  },
  'top-right': {
    originX: 'end',
    originY: 'top',
    overlayX: 'end',
    overlayY: 'bottom',
  },
  'bottom-left': {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
  },
  'bottom-center': {
    originX: 'center',
    originY: 'bottom',
    overlayX: 'center',
    overlayY: 'top',
  },
  'bottom-right': {
    originX: 'end',
    originY: 'bottom',
    overlayX: 'end',
    overlayY: 'top',
  },
  'left-top': {
    originX: 'start',
    originY: 'top',
    overlayX: 'end',
    overlayY: 'top',
  },
  'left-center': {
    originX: 'start',
    originY: 'center',
    overlayX: 'end',
    overlayY: 'center',
  },
  'left-bottom': {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'end',
    overlayY: 'bottom',
  },
  'right-top': {
    originX: 'end',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'top',
  },
  'right-center': {
    originX: 'end',
    originY: 'center',
    overlayX: 'start',
    overlayY: 'center',
  },
  'right-bottom': {
    originX: 'end',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'bottom',
  },
};

// 根据位置和offset计算位置，确保offset合适
export const getPositionWithOffset = (
  position: OverlayPosition,
  offsetX = 0,
  offsetY = 0,
): ConnectedPosition => {
  const pos = POSITION_MAP[position];
  if (position.includes('top')) {
    offsetY = -offsetY;
  }
  if (position.includes('left')) {
    offsetX = -offsetX;
  }
  return { ...pos, offsetX, offsetY };
};

const CONNECTED_OVERLAY_MARGIN = 8;

export type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'left-top'
  | 'left-center'
  | 'left-bottom'
  | 'right-top'
  | 'right-center'
  | 'right-bottom';

export interface IConnectOverlayCreateOptions {
  /**
   * Pass a BlockComponent when the overlay owns a block-level interaction: its
   * virtualized root unit stays mounted until the overlay closes or detaches.
   * HTMLElement targets keep close-on-disconnect behavior and acquire no lease.
   */
  target: HTMLElement | BlockCraft.BlockComponent;
  /** Optional visual positioning origin; target still owns lifetime and view leases. */
  origin?: HTMLElement;
  /** Live viewport geometry (e.g. a caret line). Element origin still owns scroll/lifetime tracking. */
  getOriginRect?: () => DOMRect | null;
  /** Opt-in scrollable panels: shrink on a candidate side instead of pushing across the origin. */
  fitToAvailableSpace?: boolean;
  component: ComponentType<any>;
  positions?: ConnectedPosition[];
  backdrop?: boolean;
  clampTo?: HTMLElement;
  /** Opt in only for controls whose actions remain valid in readonly mode. Defaults to false. */
  allowReadonly?: boolean;
  /**
   * Forwarded to CDK's `withFlexibleDimensions`. Defaults to `false` so
   * fixed-size overlays stay centered on their origin after position updates.
   * Set `true` only when the overlay needs CDK's shrink-to-fit behavior (for
   * example, a long picker that must flex within the viewport).
   */
  flexibleDimensions?: boolean;
}

export type IGlobalOverlayCreateOptions = {
  /** Keep read-only actions available, matching connected overlays. */
  allowReadonly?: boolean;
  component: ComponentType<any>;
  backdrop?: boolean;
} & {
  // 水平居中显示覆盖层，并可选偏移量。清除之前设置的任何水平位置。
  centerHorizontally?: string;
  // 垂直居中叠加层，并可选偏移量。清除之前设置的垂直位置。
  centerVertically?: string;
  // 垂直中心偏移量。
  offset?: string;
} & {
  // 设置遮罩的左位置。清除之前设置的任何水平位置。
  left?: string;
  // 设置遮罩的顶部位置。清除之前设置的任何垂直位置。
  top?: string;
  // 设置覆盖层的右侧位置。清除之前设置的任何水平位置。
  right?: string;
  // 设置遮罩的底部位置。清除之前设置的任何垂直位置。
  bottom?: string;
  // 将覆盖层设置在视口的开始位置，具体取决于覆盖层方向。在从左到右的布局中，这将位于左侧，在从右到左的布局中，这将位于右侧。
  start?: string;
  // 根据覆盖层方向将覆盖层设置在视口的末尾。在从左到右的布局中，这将位于右侧，在从右到左的布局中，这将位于左侧。
  end?: string;
};

type ConnectedOverlayState = {
  origin: HTMLElement;
  strategy: FlexibleConnectedPositionStrategy;
  position?: ConnectedPosition;
  getOriginRect?: () => DOMRect | null;
  fitToAvailableSpace?: boolean;
  content?: HTMLElement;
  initialMaxWidth?: string;
  initialMaxHeight?: string;
};

export class DocOverlayService {
  public readonly overlay = this.doc.injector.get(Overlay);

  constructor(private readonly doc: BlockCraft.Doc) {}

  private _acquireTargetViewLease(
    params: IGlobalOverlayCreateOptions | IConnectOverlayCreateOptions,
  ): () => void {
    if (!('target' in params) || params.target instanceof HTMLElement) {
      return () => undefined;
    }

    const release = this.doc.virtualization.acquireBlockViewLease([
      params.target.id,
    ]);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      try {
        release();
      } catch (error) {
        this.doc.logger.warn('overlayTargetViewLeaseReleaseError: ', error);
      }
    };
  }

  private _createOverlayPosition(
    params: IGlobalOverlayCreateOptions | IConnectOverlayCreateOptions,
  ): PositionStrategy {
    if ('target' in params) {
      const el = params.origin ?? (params.target instanceof HTMLElement
        ? params.target : params.target.hostElement);
      const rect = params.getOriginRect?.();
      return this.overlay
        .position()
        .flexibleConnectedTo(rect ? {x: rect.left, y: rect.top, width: rect.width, height: rect.height} : el)
        .withFlexibleDimensions(params.flexibleDimensions ?? false)
        .withGrowAfterOpen(true)
        .withPush(true)
        .withViewportMargin(CONNECTED_OVERLAY_MARGIN)
        .withPositions(
          params.positions || [
            getPositionWithOffset('top-center', 0, 0),
            getPositionWithOffset('bottom-center', 0, 0),
          ],
        );
    }

    const positionStrategy = this.overlay.position().global();
    if (params.centerHorizontally) {
      positionStrategy
        .centerHorizontally(params.centerHorizontally)
        .centerVertically(params.centerVertically);
    }
    if (params.top) {
      positionStrategy.top(params.top);
    }
    if (params.left) {
      positionStrategy.left(params.left);
    }
    if (params.bottom) {
      positionStrategy.bottom(params.bottom);
    }
    if (params.right) {
      positionStrategy.right(params.right);
    }
    if (params.start) {
      positionStrategy.start(params.start);
    }
    if (params.end) {
      positionStrategy.end(params.end);
    }
    return positionStrategy;
  }

  private _clampConnectedOverlay(
    overlayRef: OverlayRef,
    clampTo?: HTMLElement,
    connection?: ConnectedOverlayState,
  ) {
    const scrollContainer = this.doc.scrollContainer;
    if (!scrollContainer?.isConnected || !overlayRef.hasAttached()) return;

    const overlayElement = overlayRef.overlayElement;
    const hostElement = overlayRef.hostElement;
    if (!overlayElement?.isConnected || !hostElement?.isConnected) return;

    const scrollRect = scrollContainer.getBoundingClientRect();
    const clampRect = clampTo?.isConnected
      ? clampTo.getBoundingClientRect()
      : null;
    // An explicit clamp owner is authoritative. This matters for in-place
    // fullscreen blocks: their controls live in viewport coordinates while the
    // locked document scroller remains at its normal-flow geometry underneath.
    // Intersecting both rectangles would push an otherwise correctly connected
    // overlay back into the hidden document page.
    const containerRect = clampRect ?? scrollRect;
    if (containerRect.width <= 0 || containerRect.height <= 0) return;

    const maxWidth = Math.max(
      containerRect.width - CONNECTED_OVERLAY_MARGIN * 2,
      0,
    );
    const maxHeight = Math.max(
      containerRect.height - CONNECTED_OVERLAY_MARGIN * 2,
      0,
    );

    overlayRef.updateSize({
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
    });

    overlayElement.style.overflowX =
      overlayElement.scrollWidth > maxWidth ? 'auto' : '';
    overlayElement.style.overflowY =
      overlayElement.scrollHeight > maxHeight ? 'auto' : '';

    hostElement.style.transform = '';

    if (connection?.fitToAvailableSpace && connection.content) {
      // Re-measure the component's own CSS limits, not the previous fit. This
      // lets filtered lists and resized viewports grow again without stale caps.
      connection.content.style.maxWidth = connection.initialMaxWidth ?? '';
      connection.content.style.maxHeight = connection.initialMaxHeight ?? '';
    }

    let overlayRect = overlayElement.getBoundingClientRect();
    const minLeft = containerRect.left + CONNECTED_OVERLAY_MARGIN;
    const maxRight = containerRect.right - CONNECTED_OVERLAY_MARGIN;
    const minTop = containerRect.top + CONNECTED_OVERLAY_MARGIN;
    const maxBottom = containerRect.bottom - CONNECTED_OVERLAY_MARGIN;

    // CDK 按浏览器视口选择候选位置；编辑器可视区可能更小。先尝试能完整
    // 放入该边界的候选，再做平移兜底，避免把上方工具条直接压回目标块上。
    const origin = connection?.origin;
    if (connection?.fitToAvailableSpace && origin?.isConnected) {
      const targetRect = connection.getOriginRect?.() ?? origin.getBoundingClientRect();
      this._fitConnectedOverlay(overlayRef, connection, targetRect, overlayRect, {
        left: Math.max(minLeft, CONNECTED_OVERLAY_MARGIN),
        top: Math.max(minTop, CONNECTED_OVERLAY_MARGIN),
        right: Math.min(maxRight, origin.ownerDocument.documentElement.clientWidth - CONNECTED_OVERLAY_MARGIN),
        bottom: Math.min(maxBottom, origin.ownerDocument.documentElement.clientHeight - CONNECTED_OVERLAY_MARGIN),
      });
      overlayRect = overlayElement.getBoundingClientRect();
    } else if (connection && origin?.isConnected && (overlayRect.left < minLeft || overlayRect.right > maxRight ||
      overlayRect.top < minTop || overlayRect.bottom > maxBottom)) {
      const strategy = connection.strategy;
      const positions = strategy.positions;
      const targetRect = connection.getOriginRect?.() ?? origin.getBoundingClientRect();
      const viewport = origin.ownerDocument.documentElement;
      const rtl = overlayRef.getDirection() === 'rtl';
      const xRatio = (alignment: 'start' | 'center' | 'end') =>
        alignment === 'center' ? 0.5 : (alignment === 'start') === rtl ? 1 : 0;
      const yRatio = (alignment: 'top' | 'center' | 'bottom') =>
        alignment === 'center' ? 0.5 : alignment === 'top' ? 0 : 1;
      const fitting = positions.find(position => {
        const left = targetRect.left + targetRect.width * xRatio(position.originX) -
          overlayRect.width * xRatio(position.overlayX) + (position.offsetX ?? 0);
        const top = targetRect.top + targetRect.height * yRatio(position.originY) -
          overlayRect.height * yRatio(position.overlayY) + (position.offsetY ?? 0);
        return left >= Math.max(minLeft, CONNECTED_OVERLAY_MARGIN) &&
          left + overlayRect.width <= Math.min(maxRight, viewport.clientWidth - CONNECTED_OVERLAY_MARGIN) &&
          top >= Math.max(minTop, CONNECTED_OVERLAY_MARGIN) &&
          top + overlayRect.height <= Math.min(maxBottom, viewport.clientHeight - CONNECTED_OVERLAY_MARGIN);
      });
      if (fitting && fitting !== connection.position) {
        try {
          strategy.withPositions([fitting]);
          overlayRef.updatePosition();
        } finally {
          // 保留调用方的优先顺序，滚回或再次更新时仍可恢复首选位置。
          strategy.withPositions([...positions]);
        }
        overlayRect = overlayElement.getBoundingClientRect();
      }
    }

    let translateX = 0;
    let translateY = 0;

    if (overlayRect.left < minLeft) {
      translateX = minLeft - overlayRect.left;
    } else if (overlayRect.right > maxRight) {
      translateX = maxRight - overlayRect.right;
    }

    if (overlayRect.top < minTop) {
      translateY = minTop - overlayRect.top;
    } else if (overlayRect.bottom > maxBottom) {
      translateY = maxBottom - overlayRect.bottom;
    }

    hostElement.style.transform =
      translateX || translateY
        ? `translate(${translateX}px, ${translateY}px)`
        : '';
  }

  private _fitConnectedOverlay(
    overlayRef: OverlayRef,
    connection: ConnectedOverlayState,
    target: DOMRect,
    panel: DOMRect,
    bounds: {left: number; top: number; right: number; bottom: number},
  ) {
    const positions = connection.strategy.positions;
    const rtl = overlayRef.getDirection() === 'rtl';
    const physicalX = (value: 'start' | 'center' | 'end') =>
      value === 'center' ? 'center' : (value === 'start') === rtl ? 'right' : 'left';
    const candidates = positions.map(position => {
      const originX = physicalX(position.originX);
      const overlayX = physicalX(position.overlayX);
      const dx = position.offsetX ?? 0;
      const dy = position.offsetY ?? 0;
      let width = bounds.right - bounds.left;
      let height = bounds.bottom - bounds.top;
      if (originX === 'left' && overlayX === 'right') width = target.left + dx - bounds.left;
      if (originX === 'right' && overlayX === 'left') width = bounds.right - target.right - dx;
      if (position.originY === 'top' && position.overlayY === 'bottom') height = target.top + dy - bounds.top;
      if (position.originY === 'bottom' && position.overlayY === 'top') height = bounds.bottom - target.bottom - dy;
      // 顶部对齐的侧栏只使用锚点下方空间；不能把整个视口高度当作预算，
      // 否则面板变高后 CDK 会向上推移整个浮层，连顶部入口也一起跳动。
      if (position.originY === 'top' && position.overlayY === 'top') {
        height = bounds.bottom - Math.max(bounds.top, target.top + dy);
      }
      width = Math.max(0, Math.min(width, bounds.right - bounds.left));
      height = Math.max(0, Math.min(height, bounds.bottom - bounds.top));
      return {position, width, height, area: Math.min(width, panel.width) * Math.min(height, panel.height)};
    });
    // Preserve caller priority for a complete fit; otherwise maximize the
    // visible panel area while retaining the selected side's origin clearance.
    const best = candidates.find(candidate => candidate.width >= panel.width && candidate.height >= panel.height)
      ?? candidates.reduce<typeof candidates[number] | undefined>((best, candidate) =>
        !best || candidate.area > best.area ? candidate : best, undefined);
    if (!best) return;

    const content = connection.content;
    if (content) {
      const rect = content.getBoundingClientRect();
      const scaleX = content.offsetWidth ? rect.width / content.offsetWidth : 1;
      const scaleY = content.offsetHeight ? rect.height / content.offsetHeight : 1;
      const styles = content.ownerDocument.defaultView!.getComputedStyle(content);
      const pixels = (value: string) => parseFloat(value) || 0;
      const extraWidth = styles.boxSizing === 'border-box' ? 0 :
        pixels(styles.paddingLeft) + pixels(styles.paddingRight) + pixels(styles.borderLeftWidth) + pixels(styles.borderRightWidth);
      const extraHeight = styles.boxSizing === 'border-box' ? 0 :
        pixels(styles.paddingTop) + pixels(styles.paddingBottom) + pixels(styles.borderTopWidth) + pixels(styles.borderBottomWidth);
      content.style.maxWidth = `${Math.max(0, Math.min(rect.width, best.width) / (scaleX || 1) - extraWidth)}px`;
      content.style.maxHeight = `${Math.max(0, Math.min(rect.height, best.height) / (scaleY || 1) - extraHeight)}px`;
    }
    overlayRef.updateSize({maxWidth: `${best.width}px`, maxHeight: `${best.height}px`});
    try {
      connection.strategy.withPositions([best.position]);
      overlayRef.updatePosition();
    } finally {
      connection.strategy.withPositions([...positions]);
    }
    // Panels with their own scrolling retain it. Other opt-in components can
    // still reach overflowing content through the pane.
    const pane = overlayRef.overlayElement;
    pane.style.overflowX = pane.scrollWidth > pane.clientWidth ? 'auto' : '';
    pane.style.overflowY = pane.scrollHeight > pane.clientHeight ? 'auto' : '';
  }

  createConnectedOverlay<T>(
    params: IConnectOverlayCreateOptions,
    close$: Subject<any>,
    onDestroy?: () => void,
  ) {
    if (params.target instanceof HTMLElement) {
      const observer = new MutationObserver((mutationsList) => {
        if (
          !(params.target as HTMLElement).isConnected ||
          !document.contains(params.target as HTMLElement)
        ) {
          close$.next(true);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });
      close$.pipe(take(1)).subscribe(() => {
        observer.disconnect();
      });
    } else {
      params.target.onDestroy$.pipe(takeUntil(close$)).subscribe(() => {
        close$.next(true);
      });
    }

    return this._createOverlay<T>(params, close$, onDestroy);
  }

  createGlobalOverlay<T>(
    params: IGlobalOverlayCreateOptions,
    close$: Subject<any>,
    onDestroy?: () => void,
  ) {
    return this._createOverlay<T>(params, close$, onDestroy);
  }

  private _createOverlay<T>(
    params: IGlobalOverlayCreateOptions | IConnectOverlayCreateOptions,
    close$: Subject<any>,
    onDestroy?: () => void,
  ) {
    const releaseTargetView = this._acquireTargetViewLease(params);
    const {overlayRef, componentRef, positionStrategy} = (() => {
      let partialOverlayRef: OverlayRef | undefined;
      try {
        const portal = new ComponentPortal(
          params.component,
          null,
          this.doc.injector,
        );
        const positionStrategy = this._createOverlayPosition(params);
        partialOverlayRef = this.overlay.create({
          positionStrategy,
          hasBackdrop: params.backdrop,
          backdropClass: 'cdk-overlay-transparent-backdrop',
        });
        const componentRef: ComponentRef<T> = partialOverlayRef.attach(portal);
        return {
          overlayRef: partialOverlayRef,
          componentRef,
          positionStrategy,
        };
      } catch (error) {
        partialOverlayRef?.dispose();
        releaseTargetView();
        throw error;
      }
    })();

    merge(close$, overlayRef.detachments())
      .pipe(take(1))
      .subscribe(releaseTargetView);

    let closed = false;
    close$.pipe(take(1)).subscribe(() => {
      closed = true;
      onDestroy?.();
      overlayRef.dispose();
      releaseTargetView();
    });

    const content = componentRef.location?.nativeElement as HTMLElement | undefined;
    const connection: ConnectedOverlayState | undefined = 'target' in params ? {
      origin: params.origin ?? (params.target instanceof HTMLElement ? params.target : params.target.hostElement),
      strategy: positionStrategy as FlexibleConnectedPositionStrategy,
      position: undefined as ConnectedPosition | undefined,
      getOriginRect: params.getOriginRect,
      fitToAvailableSpace: params.fitToAvailableSpace,
      content,
      initialMaxWidth: content?.style.maxWidth,
      initialMaxHeight: content?.style.maxHeight,
    } : undefined;
    if (connection) {
      let clampFrame: number | null = null;
      const scheduleClamp = () => {
        if (clampFrame !== null || !overlayRef.hasAttached()) return;
        clampFrame = requestAnimationFrame(() => {
          clampFrame = null;
          if (connection.getOriginRect) {
            updatePosition();
            return;
          }
          this._clampConnectedOverlay(
            overlayRef,
            'target' in params ? params.clampTo : undefined,
            connection,
          );
        });
      };

      connection.strategy.positionChanges
        .pipe(takeUntil(close$))
        .subscribe(change => {
          connection.position = change.connectionPair;
          scheduleClamp();
        });

      let resizeObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver !== 'undefined' && this.doc.scrollContainer) {
        resizeObserver = new ResizeObserver(() => {
          scheduleClamp();
        });
        resizeObserver.observe(this.doc.scrollContainer);
        resizeObserver.observe(overlayRef.overlayElement);
        if (connection.fitToAvailableSpace || connection.getOriginRect) {
          resizeObserver.observe(connection.origin);
        }
      }
      if ((connection.fitToAvailableSpace || connection.getOriginRect) && connection.origin.ownerDocument.defaultView) {
        fromEvent(connection.origin.ownerDocument.defaultView, 'resize')
          .pipe(takeUntil(close$)).subscribe(scheduleClamp);
      }

      close$.pipe(take(1)).subscribe(() => {
        if (clampFrame !== null) cancelAnimationFrame(clampFrame);
        clampFrame = null;
        resizeObserver?.disconnect();
      });

      scheduleClamp();
    }

    params.backdrop &&
      overlayRef
        .backdropClick()
        .pipe(takeUntil(close$))
        .subscribe(() => {
          close$.next(true);
        });

    // CDK may keep the same connection pair without emitting positionChanges.
    // Geometry commits must still re-check the editor's visible boundary.
    const updatePosition = () => {
      if (!overlayRef.hasAttached()) return;
      if (connection?.getOriginRect) {
        const rect = connection.getOriginRect() ?? connection.origin.getBoundingClientRect();
        connection.strategy.setOrigin({x: rect.left, y: rect.top, width: rect.width, height: rect.height});
      }
      overlayRef.updatePosition();
      if (connection) {
        this._clampConnectedOverlay(overlayRef, 'target' in params ? params.clampTo : undefined, connection);
      }
    };

    // Connected overlay 同时跟随文档和内层祖先滚动。CDK 在候选位置未变时
    // 不一定发 positionChanges，因此每次滚动定位后仍需校验实际可视边界。
    fromEvent(connection?.origin.ownerDocument ?? this.doc.scrollContainer!, 'scroll', {capture: true})
      .pipe(filter(event => event.target === this.doc.scrollContainer ||
        !!connection && event.target instanceof Node && event.target.contains(connection.origin)), takeUntil(close$))
      .subscribe(
        throttle(updatePosition, 200),
      );

    merge(this.doc.readonlySwitch$.pipe(filter(v => v && !('allowReadonly' in params && params.allowReadonly))), this.doc.onDestroy$)
      .pipe(takeUntil(close$))
      .subscribe(() => {
        close$.next(true);
      });

    // root 节点被临时从 DOM 移除（如宿主路由切换/隐藏）时，关闭 overlay。
    // 复用 createConnectedOverlay 中 MutationObserver 的同款机制，但以 doc.root 为基准，
    // 覆盖 BlockComponent target、global overlay 等所有路径。
    if (this.doc.isInitialized && !closed) {
      const rootHost = this.doc.root.hostElement;
      if (!rootHost.isConnected) {
        close$.next(true);
      } else {
        const rootObserver = new MutationObserver(() => {
          if (!rootHost.isConnected) {
            close$.next(true);
          }
        });
        rootObserver.observe(document.body, { subtree: true, childList: true });
        close$.pipe(take(1)).subscribe(() => {
          rootObserver.disconnect();
        });
      }
    }

    return {
      overlayRef,
      componentRef,
      updatePosition,
    };
  }
}
