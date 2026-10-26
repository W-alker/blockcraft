import {HtmlAdapter} from '../../../adapters/html-adapter/html-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'
import {BlockNodeType, type IBlockSnapshot} from '../../../framework'
import {RenderUnitBlockSchema} from '..'

describe('render-unit height HTML round trip', () => {
  for (const props of [{wr: 50}, {width: 320}, {wr: 50, ar: 2}, {width: 320, height: 200}]) {
    it(`preserves width and height intent ${JSON.stringify(props)}`, async () => {
      const region = RenderUnitBlockSchema.createSnapshot({}, {...props, p: 12, border: '1px solid #333'})
      const paragraph: IBlockSnapshot = {id: 'text', flavour: 'paragraph', nodeType: BlockNodeType.editable,
        props: {}, meta: {}, children: [{insert: '填写内容', attributes: {}}]}
      region.children = [paragraph]
      const root: IBlockSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
        props: {}, meta: {}, children: [region]}
      const adapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY)
      const html = await adapter.toHtml(root)
      const imported = await adapter.toBlockSnapshot(html)
      const reopened = imported.children[0] as IBlockSnapshot
      expect(reopened.flavour).toBe('render-unit')
      expect(reopened.props).toEqual(region.props)
      expect((reopened.children[0] as IBlockSnapshot).children).toEqual(paragraph.children)
    })
  }
})
