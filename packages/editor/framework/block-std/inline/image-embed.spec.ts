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
    const image = view.querySelector<HTMLImageElement>('img.bc-inline-image')!;

    expect(view.matches('.bc-inline-image-shell[data-bc-inline-image]')).toBeTrue();
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(image.getAttribute('width')).toBe('320');
    expect(image.getAttribute('height')).toBe('180');
    expect(inlineImageEmbedConverter.toDelta(view)).toEqual(delta);
    expect(inlineImageEmbedConverter.toDelta(image)).toEqual(delta);
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
