import {HtmlAdapter} from './html-adapter';
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry';
import {BlockNodeType, type IBlockSnapshot} from '../../framework';
import {editableTypographyFromHtml, inlineTypographyFromHtml} from './typography';
import type {Element} from 'hast';

const source: IBlockSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
  props: {fs: 16}, meta: {}, children: [{id: 'p', flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {fs: 16, pfs: 1.5, heading: 1}, meta: {}, children: [
      {insert: '固定字号', attributes: {'t:px': 12.8, 't:fs': 1.25, 'a:bold': true}},
      {insert: '继承字号', attributes: {}},
    ]}]};

describe('fixed pixel typography HTML contract', () => {
  it('roundtrips base pixels, both multipliers and heading semantics', async () => {
    const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
    const html = await adapter.toHtml(source);
    const element = new DOMParser().parseFromString(html, 'text/html').querySelector('h1')!;
    expect(element.style.fontSize).toBe('24px');
    expect(element.style.getPropertyValue('--bc-block-fs-scale')).toBe('1.5');
    const imported = await adapter.toBlockSnapshot(html);
    const paragraph = imported.children[0] as IBlockSnapshot;
    expect(paragraph.props).toEqual(jasmine.objectContaining({fs: 16, pfs: 1.5, heading: 1}));
    expect(paragraph.children).toEqual((source.children[0] as IBlockSnapshot).children);
  });

  it('keeps legacy absolute px unchanged under a scaled paragraph during HTML roundtrip', async () => {
    const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
    const old: IBlockSnapshot = {...source, children: [{...(source.children[0] as IBlockSnapshot), nodeType: BlockNodeType.editable,
      children: [{insert: '旧绝对字号', attributes: {'s:fontSize': '24px'}}]}]};
    const html = await adapter.toHtml(old);
    const body = new DOMParser().parseFromString(html, 'text/html');
    expect(body.querySelector('span[style]')?.getAttribute('style')).toContain('font-size: 24px');
    const imported = await adapter.toBlockSnapshot(html);
    expect((imported.children[0] as IBlockSnapshot).children).toEqual((old.children[0] as IBlockSnapshot).children);
  });

  it('recognizes external px while keeping relative em sizes independent', () => {
    const element = (tagName: string, style: string): Element => ({type: 'element', tagName, properties: {style}, children: []});
    expect(editableTypographyFromHtml(element('p', 'font-size: 24px'))).toEqual({fs: 24});
    expect(editableTypographyFromHtml(element('p', 'font-size: 150%'))).toEqual({pfs: 1.5});
    expect(inlineTypographyFromHtml(element('span', 'font-size: 24px'))).toEqual({'s:fontSize': '24px'});
    expect(inlineTypographyFromHtml(element('span', 'font-size: 1.5em'))).toEqual({'t:fs': 1.5});
  });
});
