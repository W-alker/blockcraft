import {
  BlockNodeType,
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
  normalizeObjectPaint,
  normalizeObjectTextFrame,
  normalizeObjectTextStyle,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../framework';
import {HtmlAdapter} from './html-adapter';
import {ORDERED_MARKER_STYLES} from '../../blocks/ordered-block';

class TestDocFileService extends DocFileService {
  uploadImg(): Promise<string> {
    return Promise.resolve('');
  }

  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  previewAttachment(): void {}

  previewImg(): void {}

  createObjectURL(): string {
    return '';
  }

  getFileByObjectURL(): File | undefined {
    return undefined;
  }

  getFilePreviewURLByObjectURL(): string {
    return '';
  }

  removeObjectURL(): void {}

  isLocalObjectURL(): boolean {
    return false;
  }

  isOverMaxSize(): boolean {
    return false;
  }
}

const createVoidSnapshot = (
  id: string,
  flavour: IBlockSnapshot['flavour'],
  props: IBlockSnapshot['props']
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.void,
  props,
  meta: {},
  children: [],
});

const createRootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
});

const createParagraphSnapshot = (id: string, text: string): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 0},
  meta: {},
  children: [{insert: text}],
});

const createOrderedSnapshot = (
  id: string,
  text: string,
  markerStyle?: string,
): IBlockSnapshot => ({
  id,
  flavour: 'ordered',
  nodeType: BlockNodeType.editable,
  props: {depth: 0, order: 0, ...(markerStyle ? {ms: markerStyle} : {})},
  meta: {},
  children: [{insert: text}],
});

describe('HtmlAdapter', () => {
  const adapter = new HtmlAdapter(new TestDocFileService());

  it('exports html without blockcraft-json metadata on the root element', async () => {
    const html = await adapter.toHtml(createRootSnapshot([]));

    expect(html).not.toContain('blockcraft-json');
  });

  it('uses only portable ol types and emits no private marker-style attribute', async () => {
    const portableTypes = new Map([
      ['n1', '1'],
      ['a1', 'a'],
      ['a2', 'A'],
      ['r1', 'i'],
      ['r2', 'I'],
    ])
    for (const style of ORDERED_MARKER_STYLES) {
      const html = await adapter.toHtml(createRootSnapshot([
        createOrderedSnapshot(`ordered-${style.id}`, style.label, style.id),
      ]));
      expect(html).not.toContain('data-bc-ms');

      const imported = await adapter.toBlockSnapshot(html);
      const ordered = (imported.children as IBlockSnapshot[])[0]!;
      expect(ordered.flavour).withContext(style.id).toBe('ordered');
      const portableType = portableTypes.get(style.id)
      if (portableType) {
        expect(html).withContext(style.id).toContain(`type="${portableType}"`)
        expect(ordered.props['ms']).withContext(style.id).toBe(style.id);
      } else {
        expect(ordered.props['ms']).withContext(style.id).toBeUndefined();
      }
    }
  });

  it('maps portable external ol types and ignores private marker data', async () => {
    const importedRoman = await adapter.toBlockSnapshot('<ol type="I"><li>Roman</li></ol>');
    const roman = (importedRoman.children as IBlockSnapshot[])[0]!;
    expect(roman.props['ms']).toBe('r2');

    const importedPrivate = await adapter.toBlockSnapshot(
      '<ol><li data-bc-ms="o1">Private</li></ol>',
    );
    const privateItem = (importedPrivate.children as IBlockSnapshot[])[0]!;
    expect(privateItem.props['ms']).toBeUndefined();
  });

  it('round-trips object-group fixed geometry and local child placement', async () => {
    const group: IBlockSnapshot = {
      id: 'group-1',
      flavour: 'object-group',
      nodeType: BlockNodeType.block,
      props: {
        width: 420,
        height: 240,
        position: {x: 100, y: 80},
        placementLayer: 'under',
      },
      meta: {},
      children: [{
        id: 'shape-1',
        flavour: 'shape',
        nodeType: BlockNodeType.block,
        props: {
          shapeType: 'rectangle',
          width: 160,
          height: 80,
          rotation: 0,
          position: {x: 30, y: 40},
        },
        meta: {},
        children: [],
      }],
    }

    const html = await adapter.toHtml(createRootSnapshot([group]))
    expect(html).toContain('data-bc-block="object-group"')
    expect(html).toContain('data-object-group-width="420"')

    const imported = await adapter.toBlockSnapshot(html)
    const importedGroup = (imported.children as IBlockSnapshot[])[0]!
    expect(importedGroup.flavour).toBe('object-group')
    expect(importedGroup.props).toEqual(jasmine.objectContaining({
      width: 420,
      height: 240,
      position: {x: 100, y: 80},
      placementLayer: 'under',
    }))
    const importedShape = (importedGroup.children as IBlockSnapshot[])[0]!
    expect(importedShape.flavour).toBe('shape')
    expect(importedShape.props['position']).toEqual({x: 30, y: 40})
  });

  it('round-trips render-unit padding and background image props', async () => {
    const region: IBlockSnapshot = {
      id: 'region-1',
      flavour: 'render-unit',
      nodeType: BlockNodeType.block,
      props: {
        backColor: '#fff7d6',
        borderColor: '#dfab01',
        p: [8, 12, 16, 20],
        bgi: 'https://cdn.example.com/paper.png',
        bgs: 'contain',
        bgx: 30,
        bgy: 70,
        bgo: 0.5,
      },
      meta: {},
      children: [createParagraphSnapshot('paragraph-1', 'inside region')],
    };

    const html = await adapter.toHtml(createRootSnapshot([region]));
    expect(html).toContain('<section data-bc-block="render-unit"');
    expect(html).toContain('data-bc-p="8 12 16 20"');
    expect(html).toContain(
      'data-bc-bgi="https://cdn.example.com/paper.png"',
    );

    const imported = await adapter.toBlockSnapshot(html);
    const importedRegion = (imported.children as IBlockSnapshot[])[0]!;
    expect(importedRegion.flavour).toBe('render-unit');
    expect(importedRegion.props).toEqual(region.props);
    expect((importedRegion.children as IBlockSnapshot[])[0]?.flavour)
      .toBe('paragraph');
    const importedParagraph = (importedRegion.children as IBlockSnapshot[])[0];
    const importedDelta = importedParagraph?.children as Array<{insert: unknown}>;
    expect(importedDelta[0]?.insert).toBe('inside region');
  });

  it('drops active background image schemes on render-unit import', async () => {
    const imported = await adapter.toBlockSnapshot(
      '<section data-bc-block="render-unit" data-bc-bgi="javascript:alert(1)"><p>safe text</p></section>',
    );
    const region = (imported.children as IBlockSnapshot[])[0]!;

    expect(region.flavour).toBe('render-unit');
    expect(region.props['bgi']).toBeUndefined();
    expect((region.children as IBlockSnapshot[])[0]?.flavour).toBe('paragraph');
  });

  it('round-trips text-box geometry, placement, surface, and text children', async () => {
    const textBox: IBlockSnapshot = {
      id: 'text-box-1',
      flavour: 'text-box',
      nodeType: BlockNodeType.block,
      props: {
        width: 320,
        height: 160,
        rotation: 15,
        shape: 'rounded-speech-bubble',
        fill: storeObjectPaint({
          type: 'picture',
          opacity: .5, src: 'https://cdn.example.com/paper.png',
          fit: 'contain', positionX: 30, positionY: 70,
        }),
        outline: storeObjectLine({
          ...DEFAULT_OBJECT_LINE, color: '#dfab01', width: 2, dash: 'dash',
        }),
        effects: storeObjectEffects(DEFAULT_OBJECT_EFFECTS),
        textFrame: storeObjectTextFrame({
          ...DEFAULT_OBJECT_TEXT_FRAME,
          margins: [8, 12, 16, 20],
          direction: 'vertical-rl',
        }),
        textStyle: storeObjectTextStyle({
          ...DEFAULT_OBJECT_TEXT_STYLE,
          fill: {...DEFAULT_OBJECT_PAINT, color: '#2563EB'},
          outline: {type: 'line', color: '#FFFFFF', width: 1},
          effects: {...DEFAULT_OBJECT_EFFECTS, shadow: {
            ...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true,
          }},
        }),
        position: {
          x: 40,
          y: 60,
        },
        placementLayer: 'under',
      },
      meta: {},
      children: [
        createParagraphSnapshot('text-box-paragraph', 'inside text box'),
        {
          id: 'text-box-bullet',
          flavour: 'bullet',
          nodeType: BlockNodeType.editable,
          props: {depth: 0},
          meta: {},
          children: [{insert: 'list item'}],
        },
      ],
    };

    const html = await adapter.toHtml(createRootSnapshot([textBox]));
    expect(html).toContain('<figure data-bc-block="text-box"');
    expect(html).toContain('data-bc-object-width="320"');
    expect(html).toContain('data-bc-object-height="160"');
    expect(html).toContain('data-bc-object-rotation="15"');
    expect(html).toContain('data-text-box-placement-mode="absolute"');
    expect(html).not.toContain('data-text-box-placement-unit');
    expect(html).toContain('data-bc-object-shape="rounded-speech-bubble"');
    expect(html).toContain('data-bc-object-fill=');
    expect(html).toContain('data-bc-object-outline=');
    expect(html).toContain('data-bc-object-text-frame=');
    expect(html).toContain('data-bc-object-text-style=');

    const imported = await adapter.toBlockSnapshot(html);
    const importedTextBox = (imported.children as IBlockSnapshot[])[0]!;
    expect(importedTextBox.flavour).toBe('text-box');
    expect(normalizeObjectPaint(importedTextBox.props['fill']))
      .toEqual(jasmine.objectContaining({
        type: 'picture', src: 'https://cdn.example.com/paper.png',
        fit: 'contain', positionX: 30, positionY: 70,
      }));
    expect(normalizeObjectTextFrame(importedTextBox.props['textFrame']))
      .toEqual(jasmine.objectContaining({
        margins: [8, 12, 16, 20], direction: 'vertical-rl',
      }));
    const importedFill = normalizeObjectTextStyle(
      importedTextBox.props['textStyle'],
    ).fill;
    expect(importedFill.type).toBe('solid');
    expect(importedFill.type === 'solid' ? importedFill.color : null)
      .toBe('#2563EB');
    expect((importedTextBox.children as IBlockSnapshot[]).map(child =>
      child.flavour,
    )).toEqual(['paragraph', 'bullet']);
  });

  it('does not migrate removed text-box surface fields', async () => {
    const textBox: IBlockSnapshot = {
      id: 'text-box-artwork',
      flavour: 'text-box',
      nodeType: BlockNodeType.block,
      props: {width: 360, height: 240, bgi: 'bc:bubble-r-blob-halo'},
      meta: {},
      children: [createParagraphSnapshot('text-box-art-p', 'framed')],
    };

    const html = await adapter.toHtml(createRootSnapshot([textBox]));

    expect(html).not.toContain('data:image/svg+xml');
    expect(html).not.toContain('bubble-r-blob-halo');

    const imported = await adapter.toBlockSnapshot(html);
    const importedTextBox = (imported.children as IBlockSnapshot[])[0]!;

    expect(importedTextBox.props['bgi']).toBeUndefined();
    expect(normalizeObjectPaint(importedTextBox.props['fill']).type)
      .toBe('solid');
  });

  it('keeps a default paragraph when no supported text-box children survive', async () => {
    const imported = await adapter.toBlockSnapshot(
      '<figure data-bc-block="text-box" data-bc-bgi="javascript:alert(1)"><hr></figure>',
    );
    const textBox = (imported.children as IBlockSnapshot[])[0]!;

    expect(textBox.flavour).toBe('text-box');
    expect(textBox.props['bgi']).toBeUndefined();
    expect((textBox.children as IBlockSnapshot[]).map(child => child.flavour))
      .toEqual(['paragraph']);
  });

  describe('media blocks', () => {
    it('exports video and audio blocks as native media tags', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('video-1', 'video', {
          url: 'https://cdn.example.com/demo.mp4',
          name: 'Demo clip',
          sourceType: 'embed',
          width: 640,
          poster: 'https://cdn.example.com/poster.jpg',
          type: 'video/mp4',
        }),
        createVoidSnapshot('audio-1', 'audio', {
          url: 'https://cdn.example.com/theme.mp3',
          name: 'Theme song',
          sourceType: 'link',
          size: 2048,
        }),
      ]);

      const html = await adapter.toHtml(snapshot);

      expect(html).toMatch(/<video[^>]*src="https:\/\/cdn\.example\.com\/demo\.mp4"/);
      expect(html).toMatch(/<video[^>]*poster="https:\/\/cdn\.example\.com\/poster\.jpg"/);
      expect(html).toMatch(/<video[^>]*width="640"/);
      expect(html).toMatch(/<audio[^>]*src="https:\/\/cdn\.example\.com\/theme\.mp3"/);
      expect(html).toContain('data-source-type="embed"');
      expect(html).toContain('data-source-type="link"');
    });

    it('imports native media tags as media blocks', async () => {
      const html = [
        '<!doctype html>',
        '<html>',
        '<body>',
        '<figure><video src="https://cdn.example.com/demo.mp4" width="640" poster="https://cdn.example.com/poster.jpg" data-source-type="embed" data-type="video/mp4"></video></figure>',
        '<figure><audio src="https://cdn.example.com/theme.mp3" title="Theme song" data-size="2048"></audio></figure>',
        '</body>',
        '</html>',
      ].join('');

      const snapshot = await adapter.toBlockSnapshot(html);
      const children = snapshot.children as IBlockSnapshot[];

      expect(children[0]?.flavour).toBe('video');
      expect(children[0]?.props['url']).toBe('https://cdn.example.com/demo.mp4');
      expect(children[0]?.props['width']).toBe(640);
      expect(children[0]?.props['poster']).toBe('https://cdn.example.com/poster.jpg');
      expect(children[0]?.props['sourceType']).toBe('embed');
      expect(children[0]?.props['type']).toBe('video/mp4');

      expect(children[1]?.flavour).toBe('audio');
      expect(children[1]?.props['url']).toBe('https://cdn.example.com/theme.mp3');
      expect(children[1]?.props['name']).toBe('Theme song');
      expect(children[1]?.props['size']).toBe(2048);
    });

    it('round-trips responsive video wr/ar while keeping legacy width support', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('video-responsive', 'video', {
          url: 'https://cdn.example.com/responsive.mp4',
          sourceType: 'link',
          wr: 62.5,
          ar: 16 / 9,
        }),
      ]);

      const html = await adapter.toHtml(snapshot);
      expect(html).toContain('data-bc-wr="62.5"');
      expect(html).toContain(`data-bc-ar="${16 / 9}"`);
      expect(html).toContain('width: 62.5%');

      const imported = await adapter.toBlockSnapshot(html);
      const video = (imported.children as IBlockSnapshot[])[0];
      expect(video.props['wr']).toBe(62.5);
      expect(video.props['ar']).toBeCloseTo(16 / 9);
      expect(video.props['width']).toBeUndefined();
    });

    it('exports responsive image sizing without legacy pixel attributes', async () => {
      const image: IBlockSnapshot = {
        id: 'image-responsive',
        flavour: 'image',
        nodeType: BlockNodeType.block,
        props: {
          src: 'https://cdn.example.com/image.png',
          wr: 45,
          ar: 3 / 2,
        },
        meta: {},
        children: [],
      };

      const html = await adapter.toHtml(createRootSnapshot([image]));
      expect(html).toContain('data-bc-wr="45"');
      expect(html).toContain('data-bc-ar="1.5"');
      expect(html).toContain('width: 45%');
      expect(html).not.toMatch(/<img[^>]*width="45"/);
    });
  });

  describe('typography', () => {
    it('round-trips compact root, block, and inline typography with portable styles', async () => {
      const root = createRootSnapshot([{
        id: 'paragraph-typography',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {
          depth: 0,
          pfs: 1.5,
          lh: 1.8,
          psb: 6,
          psa: 12,
          // Dormant legacy indent props must not re-enter HTML/CSS projection.
          pis: 18,
          pie: 9,
          pti: -24,
        },
        meta: {},
        children: [{
          insert: '排版示例',
          attributes: {'t:ff': 'kai', 't:fs': 1.25, 't:ls': 0.08},
        }],
      }]);
      root.props = {ff: 'serif', fs: 18, lh: 1.6};

      const html = await adapter.toHtml(root);
      const document = new DOMParser().parseFromString(html, 'text/html');
      const body = document.body;
      const paragraph = document.querySelector('p')!;
      const inline = paragraph.querySelector('span')!;

      expect(body.getAttribute('data-bc-ff')).toBe('serif');
      expect(body.getAttribute('data-bc-fs')).toBe('18');
      expect(body.getAttribute('data-bc-lh')).toBe('1.6');
      expect(body.style.fontFamily).toContain('Songti SC');
      expect(body.style.fontSize).toBe('18px');
      expect(body.style.lineHeight).toBe('1.6');
      expect(paragraph.getAttribute('data-bc-lh')).toBe('1.8');
      expect(paragraph.getAttribute('data-bc-pfs')).toBe('1.5');
      expect(paragraph.getAttribute('data-bc-sb')).toBe('6');
      expect(paragraph.getAttribute('data-bc-sa')).toBe('12');
      expect(paragraph.hasAttribute('data-bc-is')).toBeFalse();
      expect(paragraph.hasAttribute('data-bc-ie')).toBeFalse();
      expect(paragraph.hasAttribute('data-bc-ti')).toBeFalse();
      expect(paragraph.style.lineHeight).toBe('1.8');
      expect(paragraph.style.fontSize).toBe('150%');
      expect(paragraph.style.marginTop).toBe('6pt');
      expect(paragraph.style.marginBottom).toBe('12pt');
      expect(paragraph.style.paddingInlineStart).toBe('');
      expect(paragraph.style.paddingInlineEnd).toBe('');
      expect(paragraph.style.textIndent).toBe('');
      expect(inline.getAttribute('data-bc-ff')).toBe('kai');
      expect(inline.getAttribute('data-bc-fs')).toBe('1.25');
      expect(inline.getAttribute('data-bc-ls')).toBe('0.08');
      expect(inline.style.fontFamily).toContain('Kaiti SC');
      expect(inline.style.fontSize).toBe('1.25em');
      expect(inline.style.letterSpacing).toBe('0.08em');

      const imported = await adapter.toBlockSnapshot(html);
      expect(imported.props).toEqual(jasmine.objectContaining({
        ff: 'serif',
        fs: 18,
        lh: 1.6,
      }));
      const importedParagraph = (imported.children as IBlockSnapshot[])[0];
      expect(importedParagraph.props).toEqual(jasmine.objectContaining({
        pfs: 1.5,
        lh: 1.8,
        psb: 6,
        psa: 12,
      }));
      expect(importedParagraph.children).toEqual([{
        insert: '排版示例',
        attributes: {'t:ff': 'kai', 't:fs': 1.25, 't:ls': 0.08},
      }]);
    });

    it('normalizes supported legacy inline styles into compact typography', async () => {
      const root = createRootSnapshot([{
        id: 'paragraph-legacy-typography',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {depth: 0},
        meta: {},
        children: [{
          insert: 'Legacy',
          attributes: {
            's:fontFamily': 'serif',
            's:fontSize': '1.2em',
            's:letterSpacing': '0.05em',
          },
        }],
      }]);

      const html = await adapter.toHtml(root);
      const inline = new DOMParser().parseFromString(html, 'text/html')
        .querySelector('span[data-bc-ff]')!;
      expect(inline.getAttribute('data-bc-ff')).toBe('serif');
      expect(inline.getAttribute('data-bc-fs')).toBe('1.2');
      expect(inline.getAttribute('data-bc-ls')).toBe('0.05');

      const imported = await adapter.toBlockSnapshot(html);
      const paragraph = (imported.children as IBlockSnapshot[])[0];
      expect(paragraph.children).toEqual([{
        insert: 'Legacy',
        attributes: {'t:ff': 'serif', 't:fs': 1.2, 't:ls': 0.05},
      }]);
    });

    it('imports only allowlisted typography from external styles', async () => {
      const html = [
        '<html><body style="font-family: Kaiti SC, KaiTi, serif; font-size: 20px; line-height: 1.7">',
        '<p style="line-height: 1.9">',
        '<span style="font-family: Kaiti SC, KaiTi, serif; font-size: 1.4em; letter-spacing: .1em">safe</span>',
        '<span style="font-family: url(javascript:bad), serif; font-size: 99em; letter-spacing: 2em">unsafe</span>',
        '</p></body></html>',
      ].join('');

      const imported = await adapter.toBlockSnapshot(html);
      expect(imported.props).toEqual(jasmine.objectContaining({
        ff: 'kai',
        fs: 20,
        lh: 1.7,
      }));
      const paragraph = (imported.children as IBlockSnapshot[])[0];
      expect(paragraph.props).toEqual(jasmine.objectContaining({lh: 1.9}));
      expect(paragraph.children).toEqual([
        {
          insert: 'safe',
          attributes: {'t:ff': 'kai', 't:fs': 1.4, 't:ls': 0.1},
        },
        {insert: 'unsafe', attributes: {}},
      ]);
    });

    it('round-trips a safe legacy root font stack', async () => {
      const root = createRootSnapshot([
        createParagraphSnapshot('paragraph-root-legacy', 'Legacy root'),
      ]);
      root.props = {ff: 'Georgia, serif', fs: 17, lh: 1.45};

      const html = await adapter.toHtml(root);
      const body = new DOMParser().parseFromString(html, 'text/html').body;
      expect(body.getAttribute('data-bc-ff')).toBe('Georgia, serif');
      expect(body.style.fontFamily).toBe('Georgia, serif');

      const imported = await adapter.toBlockSnapshot(html);
      expect(imported.props).toEqual(jasmine.objectContaining({
        ff: 'Georgia, serif',
        fs: 17,
        lh: 1.45,
      }));
    });

    it('imports root typography when body text creates a fallback paragraph', async () => {
      const imported = await adapter.toBlockSnapshot(
        '<html><body style="font-family:KaiTi, serif;font-size:20px;line-height:1.7">Direct text</body></html>',
      );

      expect(imported.props).toEqual(jasmine.objectContaining({
        ff: 'kai',
        fs: 20,
        lh: 1.7,
      }));
      const paragraph = (imported.children as IBlockSnapshot[])[0];
      expect(paragraph.children).toEqual([{insert: 'Direct text', attributes: {}}]);
      expect(paragraph.props['lh']).toBeUndefined();
    });

    it('rejects malicious typography styles at root, block, and inline levels', async () => {
      const imported = await adapter.toBlockSnapshot([
        '<html><body style="font-family:url(javascript:root);font-size:999px;line-height:calc(1 + 1)">',
        '<p style="line-height:99">',
        '<span style="font-family:expression(alert(1));font-size:99em;letter-spacing:2em">safe text</span>',
        '</p></body></html>',
      ].join(''));

      expect(imported.props['ff']).toBeUndefined();
      expect(imported.props['fs']).toBeUndefined();
      expect(imported.props['lh']).toBeUndefined();
      const paragraph = (imported.children as IBlockSnapshot[])[0];
      expect(paragraph.props['lh']).toBeUndefined();
      expect(paragraph.children).toEqual([{insert: 'safe text', attributes: {}}]);
    });
  });
});
