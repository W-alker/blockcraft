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
  target: HTMLElement | BlockCraft.BlockComponent;
  component: ComponentType<any>;
  positions?: ConnectedPosition[];
  backdrop?: boolean;
}

export type IGlobalOverlayCreateOptions = {
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

export class DocOverlayService {
  public readonly overlay = this.doc.injector.get(Overlay);

  constructor(private readonly doc: BlockCraft.Doc) {}

  private _createOverlayPosition(
    params: IGlobalOverlayCreateOptions | IConnectOverlayCreateOptions,
  ): PositionStrategy {
    if ('target' in params) {
      const el =
        params.target instanceof HTMLElement
          ? params.target
          : params.target.hostElement;
      return this.overlay
        .position()
        .flexibleConnectedTo(el)
        .withFlexibleDimensions(true)
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

  private _clampConnectedOverlay(overlayRef: OverlayRef) {
    const scrollContainer = this.doc.scrollContainer;
    if (!scrollContainer?.isConnected) return;

    const containerRect = scrollContainer.getBoundingClientRect();
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

    const overlayElement = overlayRef.overlayElement;
    const hostElement = overlayRef.hostElement;

    overlayElement.style.overflowX =
      overlayElement.scrollWidth > maxWidth ? 'auto' : '';
    overlayElement.style.overflowY =
      overlayElement.scrollHeight > maxHeight ? 'auto' : '';

    hostElement.style.transform = '';

    const overlayRect = overlayElement.getBoundingClientRect();
    const minLeft = containerRect.left + CONNECTED_OVERLAY_MARGIN;
    const maxRight = containerRect.right - CONNECTED_OVERLAY_MARGIN;
    const minTop = containerRect.top + CONNECTED_OVERLAY_MARGIN;
    const maxBottom = containerRect.bottom - CONNECTED_OVERLAY_MARGIN;

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
    // 根据情况设置
    const portal = new ComponentPortal(
      params.component,
      null,
      this.doc.injector,
    );
    const positionStrategy = this._createOverlayPosition(params);

    const overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: params.backdrop,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    const componentRef: ComponentRef<T> = overlayRef.attach(portal);

    if ('target' in params) {
      const scheduleClamp = () => {
        requestAnimationFrame(() => {
          if (!overlayRef.hasAttached()) return;
          this._clampConnectedOverlay(overlayRef);
        });
      };

      (positionStrategy as FlexibleConnectedPositionStrategy).positionChanges
        .pipe(takeUntil(close$))
        .subscribe(scheduleClamp);

      let resizeObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver !== 'undefined' && this.doc.scrollContainer) {
        resizeObserver = new ResizeObserver(() => {
          scheduleClamp();
        });
        resizeObserver.observe(this.doc.scrollContainer);
        resizeObserver.observe(overlayRef.overlayElement);
      }

      close$.pipe(take(1)).subscribe(() => {
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

    fromEvent(this.doc.scrollContainer!, 'scroll')
      .pipe(takeUntil(close$))
      .subscribe(
        throttle(() => {
          overlayRef && overlayRef.updatePosition();
          'target' in params && this._clampConnectedOverlay(overlayRef);
        }, 200),
      );

    merge(this.doc.readonlySwitch$.pipe(filter((v) => v)), this.doc.onDestroy$)
      .pipe(takeUntil(close$))
      .subscribe(() => {
        close$.next(true);
      });

    close$.pipe(take(1)).subscribe(() => {
      onDestroy?.();
      overlayRef.dispose();
    });

    return {
      overlayRef,
      componentRef,
    };
  }
}
