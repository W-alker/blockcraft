import type {DeltaInsertEmbed} from '../types';
import type {EmbedConverter} from './index';
import {
  createInlineImageDelta,
  inlineImageEmbedConverter,
  readInlineImageDelta,
  withDefaultEmbedConverters,
} from './image-embed';

describe('inlineImageEmbedConverter', () => {
  it('round-trips src and short width/height attributes', () => {
    const delta = createInlineImageDelta(
      'https://cdn.example.com/a.png',
      320,
      180,
    )!;

    const view = inlineImageEmbedConverter.toView(delta);
    const frame = view.querySelector<HTMLElement>('.bc-inline-image-frame')!;
    const image = view.querySelector<HTMLImageElement>('img.bc-inline-image')!;

    expect(view.matches('.bc-inline-image-shell[data-bc-inline-image]')).toBeTrue();
    expect(frame).not.toBeNull();
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(image.getAttribute('width')).toBe('320');
    expect(image.getAttribute('height')).toBe('180');
    expect(image.draggable).toBeFalse();
    expect(image.getAttribute('draggable')).toBe('false');
    expect(inlineImageEmbedConverter.toDelta(view)).toEqual(delta);
    expect(inlineImageEmbedConverter.toDelta(frame)).toEqual(delta);
    expect(inlineImageEmbedConverter.toDelta(image)).toEqual(delta);
    inlineImageEmbedConverter.onDestroy?.(view, delta);
  });

  it('cancels native image drag at the embed boundary and removes the guard on destroy', () => {
    const delta = createInlineImageDelta(
      'https://cdn.example.com/native-drag.png',
      320,
      180,
      {wrap: true, side: 'auto', x: .25},
    )!;
    const root = document.createElement('div');
    const view = inlineImageEmbedConverter.toView(delta);
    const image = view.querySelector<HTMLImageElement>('img.bc-inline-image')!;
    const rootDragStart = jasmine.createSpy('rootDragStart');
    root.addEventListener('dragstart', rootDragStart);
    root.appendChild(view);

    const guardedEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    });
    image.dispatchEvent(guardedEvent);

    expect(guardedEvent.defaultPrevented).toBeTrue();
    expect(rootDragStart).not.toHaveBeenCalled();

    inlineImageEmbedConverter.onDestroy?.(view, delta);
    inlineImageEmbedConverter.onDestroy?.(view, delta);
    const afterDestroyEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    });
    image.dispatchEvent(afterDestroyEvent);

    expect(afterDestroyEvent.defaultPrevented).toBeFalse();
    expect(rootDragStart).toHaveBeenCalledTimes(1);
    root.remove();
  });

  it('reserves a stable 4:3 frame before an unsized image loads', () => {
    const delta = createInlineImageDelta('https://cdn.example.com/a.png')!;

    const view = inlineImageEmbedConverter.toView(delta);
    const frame = view.querySelector<HTMLElement>('.bc-inline-image-frame')!;
    const image = view.querySelector<HTMLImageElement>('img.bc-inline-image')!;

    expect(view.style.width).toBe('320px');
    expect(view.style.aspectRatio).toBe('320 / 240');
    expect(frame.style.width).toBe('320px');
    expect(frame.style.aspectRatio).toBe('320 / 240');
    expect(frame.dataset['bcResourceState']).toBe('loading');

    image.dispatchEvent(new Event('error'));
    expect(frame.dataset['bcResourceState']).toBe('error');

    inlineImageEmbedConverter.onDestroy?.(view, delta);
    expect(view.querySelector('.bc-resource-placeholder')).toBeNull();
  });

  it('rejects empty src and ignores invalid dimensions', () => {
    expect(createInlineImageDelta('', 10, 10)).toBeNull();
    expect(readInlineImageDelta({
      insert: {image: 'https://cdn.example.com/a.png'},
      attributes: {width: -1, height: 0},
    } as DeltaInsertEmbed)).toEqual({
      src: 'https://cdn.example.com/a.png',
    });
  });

  it('normalizes and round-trips square-wrap attributes', () => {
    const delta = createInlineImageDelta(
      'https://cdn.example.com/wrapped.png',
      176,
      106,
      {
        wrap: true,
        side: 'auto',
        x: 1.4,
        gap: 0,
      },
    )!;

    expect(delta).toEqual({
      insert: {image: 'https://cdn.example.com/wrapped.png'},
      attributes: {
        width: 176,
        height: 106,
        wrap: true,
        side: 'auto',
        x: 1,
        gap: 0,
      },
    });

    const view = inlineImageEmbedConverter.toView(delta);
    const frame = view.querySelector<HTMLElement>('.bc-inline-image-frame')!;
    const image = view.querySelector<HTMLImageElement>('img.bc-inline-image')!;

    expect(view.dataset['bcInlineFloat']).toBe('true');
    expect(view.dataset['bcInlineImageLayout']).toBe('wrap');
    expect(view.dataset['bcInlineImageWrapSide']).toBe('auto');
    expect(view.dataset['bcInlineImageWrapX']).toBe('1');
    expect(view.dataset['bcInlineImageWrapGap']).toBe('0');
    expect(frame.style.width).toBe('176px');
    expect(frame.style.aspectRatio).toBe('176 / 106');
    expect(inlineImageEmbedConverter.toDelta(view)).toEqual(delta);
    expect(inlineImageEmbedConverter.toDelta(frame)).toEqual(delta);
    expect(inlineImageEmbedConverter.toDelta(image)).toEqual(delta);

    inlineImageEmbedConverter.onDestroy?.(view, delta);
  });

  it('ignores wrap details unless square wrapping is enabled', () => {
    expect(createInlineImageDelta(
      'https://cdn.example.com/a.png',
      undefined,
      undefined,
      {
        side: 'invalid' as any,
        x: Number.NaN,
        gap: -1,
      },
    )).toEqual({
      insert: {image: 'https://cdn.example.com/a.png'},
    });

    expect(readInlineImageDelta({
      insert: {image: 'https://cdn.example.com/a.png'},
      attributes: {
        wrap: true,
        side: 'invalid',
        x: -1,
        gap: -1,
      },
    } as DeltaInsertEmbed)).toEqual({
      src: 'https://cdn.example.com/a.png',
      wrap: true,
      side: 'auto',
      x: 0,
    });
  });

  it('lets a configured image converter override the built-in converter', () => {
    const custom: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {image: 'custom'}}),
    };
    const mention: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {mention: 'A'}}),
    };

    const resolved = new Map(withDefaultEmbedConverters([
      ['mention', mention],
      ['image', custom],
    ]));

    expect(resolved.get('image')).toBe(custom);
    expect(resolved.get('mention')).toBe(mention);
  });
});
