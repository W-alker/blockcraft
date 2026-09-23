import type {Element} from 'hast';
import {HtmlAdapter} from './html-adapter';
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry';
import {editableTypographyFromHtml} from './typography';
import {BlockNodeType, type IBlockSnapshot} from '../../framework';

function root(textAlign: 'center' | 'right' | 'justify' | 'distributed'): IBlockSnapshot {
  return {id:'root', flavour:'root', nodeType:BlockNodeType.root, props:{}, meta:{}, children:[{
    id:'paragraph', flavour:'paragraph', nodeType:BlockNodeType.editable, props:{textAlign}, meta:{},
    children:[{insert:'加粗正文',attributes:{'a:bold':true}}, {insert:'普通正文',attributes:{}}, {insert:{icon:'bc_icon bc_wenben'}}],
  }]};
}

describe('paragraph alignment HTML contract', () => {
  for (const align of ['center', 'right', 'justify', 'distributed'] as const) {
    it(`round trips ${align} together with inline formatting and embeds`, async () => {
      const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
      const source = root(align);
      const html = await adapter.toHtml(source);
      const element = new DOMParser().parseFromString(html,'text/html').querySelector('p')!;
      expect(element.style.textAlign).toBe(align === 'distributed' ? 'justify' : align);
      if (align === 'distributed') expect(element.style.textAlignLast).toBe('justify');
      const imported = await adapter.toBlockSnapshot(html);
      const paragraph = imported.children[0] as IBlockSnapshot;
      expect(paragraph.props.textAlign).toBe(align);
      expect(paragraph.children).toEqual((source.children[0] as IBlockSnapshot).children);
    });
  }

  it('recognizes external CSS and ignores unsupported alignment expressions', () => {
    const element = (style: string): Element => ({type:'element',tagName:'p',properties:{style},children:[]});
    expect(editableTypographyFromHtml(element('text-align: justify; text-align-last: justify')).textAlign).toBe('distributed');
    expect(editableTypographyFromHtml(element('text-align: justify')).textAlign).toBe('justify');
    expect(editableTypographyFromHtml(element('text-align: var(--align)')).textAlign).toBeUndefined();
    expect(editableTypographyFromHtml(element('text-align-last: justify')).textAlign).toBeUndefined();
  });
});
