import {fakeAsync, tick} from '@angular/core/testing';
import {
  INLINE_IMAGE_RESIZE_LABEL_ATTRIBUTE,
  INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE,
  InlineImageResizeSession,
  resolveInlineImageResizePreview,
} from './inline-image-resize';

const setRect = (element: HTMLElement, rect: Partial<DOMRect>): void => {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  });
};

describe('inline image resize preview', () => {
  it('keeps the opposite horizontal edge fixed and clamps to editable bounds', () => {
    expect(resolveInlineImageResizePreview({
      side: 'left',
      pointerX: 50,
      startPointerX: 200,
      startLeft: 200,
      startTop: 80,
      startWidth: 120,
      startHeight: 60,
      boundsLeft: 100,
      boundsRight: 600,
    })).toEqual({
      left: 100,
      top: 80,
      width: 220,
      height: 110,
    });

    expect(resolveInlineImageResizePreview({
      side: 'right',
      pointerX: 800,
      startPointerX: 320,
      startLeft: 200,
      startTop: 80,
      startWidth: 120,
      startHeight: 60,
      boundsLeft: 100,
      boundsRight: 600,
    })).toEqual({
      left: 200,
      top: 80,
      width: 400,
      height: 200,
    });
  });

  it('projects an inert body outline while leaving the real frame unchanged', fakeAsync(() => {
    const bounds = document.createElement('div');
    const frame = document.createElement('div');
    const handle = document.createElement('div');
    bounds.append(frame, handle);
    document.body.appendChild(bounds);
    frame.style.width = '120px';
    frame.style.height = '60px';
    setRect(bounds, {
      left: 100,
      top: 40,
      right: 600,
      bottom: 300,
      width: 500,
      height: 260,
    });
    setRect(frame, {
      left: 200,
      top: 80,
      right: 320,
      bottom: 140,
      width: 120,
      height: 60,
    });
    const setPointerCapture = jasmine.createSpy('setPointerCapture');
    const releasePointerCapture = jasmine.createSpy('releasePointerCapture');
    Object.defineProperties(handle, {
      setPointerCapture: {value: setPointerCapture},
      hasPointerCapture: {value: () => true},
      releasePointerCapture: {value: releasePointerCapture},
    });
    const releaseLayout = jasmine.createSpy('releaseLayout');
    const releaseView = jasmine.createSpy('releaseView');
    const onCommit = jasmine.createSpy('onCommit');
    const onFinish = jasmine.createSpy('onFinish');
    const originalStyle = frame.getAttribute('style');
    const session = new InlineImageResizeSession({
      event: {
        currentTarget: handle,
        pointerId: 7,
        clientX: 320,
      } as unknown as PointerEvent,
      side: 'right',
      frame,
      bounds,
      acquireLayoutFreeze: () => releaseLayout,
      acquireViewLease: () => releaseView,
      onCommit,
      onFinish,
    });

    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 7,
      clientX: 440,
      isPrimary: true,
    }));
    tick(17);

    const proxy = document.querySelector<HTMLElement>(
      `[${INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE}]`,
    );
    expect(session.active).toBeTrue();
    expect(proxy).not.toBeNull();
    expect(proxy!.parentElement).toBe(document.body);
    expect(proxy!.style.pointerEvents).toBe('none');
    expect(proxy!.style.left).toBe('200px');
    expect(proxy!.style.width).toBe('240px');
    expect(proxy!.style.height).toBe('120px');
    expect(proxy!.querySelector(`[${INLINE_IMAGE_RESIZE_LABEL_ATTRIBUTE}]`)!
      .textContent).toBe('240 × 120');
    expect(frame.getAttribute('style')).toBe(originalStyle);
    expect(releaseLayout).not.toHaveBeenCalled();
    expect(releaseView).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 7,
      clientX: 440,
      isPrimary: true,
    }));

    expect(session.active).toBeFalse();
    expect(onCommit).toHaveBeenCalledOnceWith({
      left: 200,
      top: 80,
      width: 240,
      height: 120,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseView).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledOnceWith(7);
    expect(releasePointerCapture).toHaveBeenCalledOnceWith(7);
    expect(document.querySelector(
      `[${INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE}]`,
    )).toBeNull();
    expect(frame.getAttribute('style')).toBe(originalStyle);
    bounds.remove();
  }));

  it('cancels through Escape without committing and releases resources once', () => {
    const bounds = document.createElement('div');
    const frame = document.createElement('div');
    const handle = document.createElement('div');
    bounds.append(frame, handle);
    document.body.appendChild(bounds);
    setRect(bounds, {left: 0, right: 500, width: 500});
    setRect(frame, {
      left: 100,
      top: 80,
      right: 220,
      bottom: 140,
      width: 120,
      height: 60,
    });
    const releaseLayout = jasmine.createSpy('releaseLayout');
    const releaseView = jasmine.createSpy('releaseView');
    const onCommit = jasmine.createSpy('onCommit');
    const session = new InlineImageResizeSession({
      event: {
        currentTarget: handle,
        pointerId: 8,
        clientX: 100,
      } as unknown as PointerEvent,
      side: 'left',
      frame,
      bounds,
      acquireLayoutFreeze: () => releaseLayout,
      acquireViewLease: () => releaseView,
      onCommit,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    session.cancel();

    expect(onCommit).not.toHaveBeenCalled();
    expect(releaseLayout).toHaveBeenCalledTimes(1);
    expect(releaseView).toHaveBeenCalledTimes(1);
    expect(document.querySelector(
      `[${INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE}]`,
    )).toBeNull();
    bounds.remove();
  });
});
