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

  for (const [flavour, tag, extra] of [
    ['paragraph', 'p', {}], ['paragraph', 'h2', {heading: 2}],
    ['blockquote', 'blockquote', {}], ['bullet', 'li', {}],
    ['ordered', 'li', {}], ['todo', 'li', {}], ['code', 'pre', {lang: 'PlainText'}],
  ] as const) {
    it(`保留 ${flavour}/${tag} 的缩进、内容及往返层级`, async () => {
      const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY);
      const snapshot: IBlockSnapshot = {...source, children: [{
        id: 'indented', flavour, nodeType: BlockNodeType.editable,
        props: {depth: 2, ...extra}, meta: {}, children: [{insert: '缩进内容'}],
      }]};
      const before = JSON.stringify(snapshot);
      const html = await adapter.toHtml(snapshot);
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      try {
        const element = host.querySelector(tag)!;
        expect(getComputedStyle(element).marginLeft).toBe('64px');
        expect(element.textContent).toContain('缩进内容');
        expect(element.getAttribute('data-bc-depth')).toBe('2');
      } finally { host.remove(); }
      const restored = await adapter.toBlockSnapshot(html);
      const block = restored.children[0] as IBlockSnapshot;
      expect(block.props['depth']).toBe(2);
      expect(JSON.stringify(snapshot)).toBe(before);
    });
  }

  it('忽略非法缩进元数据，不把外部 margin 擅自转换为层级', () => {
    for (const dataBcDepth of ['-1', '1.5', 'Infinity', 'broken', '']) {
      expect(editableTypographyFromHtml({type: 'element', tagName: 'p', children: [],
        properties: {dataBcDepth, style: 'margin-left:64px'}})['depth']).toBeUndefined();
    }
  });
});
