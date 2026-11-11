import {HtmlAdapter} from './html-adapter';
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry';
import {BlockNodeType, type IBlockSnapshot} from '../../framework';
import {inlineTypographyFromHtml} from './typography';

describe('numeric font weight HTML', () => {
  it('roundtrips numeric, legacy bold and paragraph default weights', async () => {
    const children = [
      {insert: '中等', attributes: {'s:fontWeight': '500'}},
      {insert: '半粗', attributes: {'s:fontWeight': '600', 'a:bold': true}},
      {insert: '旧粗体', attributes: {'a:bold': true}},
      {insert: '常规', attributes: {'s:fontWeight': '400'}},
    ];
    const source: IBlockSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
      props: {}, meta: {}, children: [{id: 'p', flavour: 'paragraph', nodeType: BlockNodeType.editable,
        props: {textDefaults: {'s:fontWeight': '500'}}, meta: {}, children}]};
    const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
    const html = await adapter.toHtml(source);
    expect(html).toContain('font-weight: 500');
    const imported = await adapter.toBlockSnapshot(html);
    expect((imported.children[0] as IBlockSnapshot).children).toEqual(children);
    expect((imported.children[0] as IBlockSnapshot).props['textDefaults']).toEqual({'s:fontWeight': '500'});
  });
  it('imports explicit normal weight and rejects malformed weights', () => {
    expect(inlineTypographyFromHtml({type: 'element', tagName: 'span', properties: {style: 'font-weight: normal'}, children: []})).toEqual({'s:fontWeight': '400'});
    expect(inlineTypographyFromHtml({type: 'element', tagName: 'span', properties: {style: 'font-weight: nope'}, children: []})).toBeNull();
  });
});
