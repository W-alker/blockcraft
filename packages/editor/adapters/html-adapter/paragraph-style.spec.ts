import {HtmlAdapter} from './html-adapter';
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry';
import {BlockNodeType, type IBlockSnapshot} from '../../framework';
import {editableTypographyFromHtml} from './typography';

describe('段落标记格式序列化', () => {
  const props = {depth: 0, pfs: 1.5, lh: 2, psb: 6, psa: 12,
    textDefaults: {'t:px': 24, 't:ff': 'times', 'a:bold': true}, nextParagraphStyle: 'same'};
  const source: IBlockSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
    props: {}, meta: {}, children: [{id: 'p', flavour: 'paragraph', nodeType: BlockNodeType.editable,
      props, meta: {}, children: []}]};

  it('空段落的 HTML 往返不丢默认字符格式或重复字号倍率', async () => {
    const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
    const html = await adapter.toHtml(source);
    const imported = await adapter.toBlockSnapshot(html);
    expect((imported.children[0] as IBlockSnapshot).props).toEqual(jasmine.objectContaining(props));
    expect((imported.children[0] as IBlockSnapshot).props['fs']).toBeUndefined();
  });

  it('忽略外部 HTML 中损坏的格式元数据', () => {
    expect(editableTypographyFromHtml({type: 'element', tagName: 'p', children: [],
      properties: {dataBcTextDefaults: '{broken', dataBcNextStyle: 'invalid'}})).toEqual({});
  });
});
