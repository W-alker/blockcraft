import {TextBoxBlockSchema, normalizeTextBoxProps} from './index'
import {ShapeBlockSchema, normalizeShapeProps, normalizeShapeSnapshotProps} from '../shape-block'
import {WordArtBlockSchema, normalizeWordArtProps} from '../word-art-block'
import {BlockNodeType, DocFileService, type IBlockSnapshot} from '../../framework'
import {HtmlAdapter} from '../../adapters/html-adapter/html-adapter'
import {MarkdownAdapter} from '../../adapters/markdown-adapter/markdown-adapter'
import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../adapters/registry'
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry'
import {createSnapshotRenderer} from '../../snapshot-viewer'

describe('formatted object size persistence', () => {
  // These text/vector-only fixtures never fetch or upload resources.
  const files = jasmine.createSpyObj<DocFileService>('files', ['getFilePreviewURLByObjectURL', 'isLocalObjectURL'])
  const html = new HtmlAdapter(files, new Map(), BUNDLED_ADAPTER_REGISTRY)
  const markdown = new MarkdownAdapter(files, new Map(), BUNDLED_ADAPTER_REGISTRY)
  markdown.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft')
  const root = (child: IBlockSnapshot): IBlockSnapshot => ({
    id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [child],
  })

  for (const kind of ['shape', 'text-box', 'word-art'] as const) {
    const normalize = kind === 'shape' ? normalizeShapeProps : kind === 'text-box' ? normalizeTextBoxProps : normalizeWordArtProps
    it(`${kind} clamps invalid geometry without changing default dimensions`, () => {
      expect(normalize({width: -1, height: 30000})).toEqual(jasmine.objectContaining({width: 8, height: 20000}))
      expect(normalize({width: NaN, height: Infinity})).toEqual(normalize({}))
    })

    for (const [width, height] of [[8, 8], [20, 12], [4000, 3000], [20000, 20000]]) {
      it(`${kind} retains ${width}x${height} through snapshots, HTML, Markdown and readonly rendering`, async () => {
        const props = {width, height, textAutoFit: 'none' as const}
        const snapshot = kind === 'shape' ? ShapeBlockSchema.createSnapshot('rectangle', '尺寸')
          : kind === 'text-box' ? TextBoxBlockSchema.createSnapshot('尺寸', props)
          : WordArtBlockSchema.createSnapshot('尺寸', props)
        if (kind === 'shape') snapshot.props = normalizeShapeSnapshotProps({shape: 'rectangle', ...props})
        const restored = JSON.parse(JSON.stringify(snapshot)) as IBlockSnapshot
        for (const item of [restored,
          (await html.toBlockSnapshot(await html.toHtml(root(restored)))).children[0] as IBlockSnapshot,
          (await markdown.toBlockSnapshot(await markdown.toMarkdown(root(restored)))).children[0] as IBlockSnapshot,
        ]) {
          expect(item.flavour).toBe(kind)
          expect(normalize(item.props)).toEqual(jasmine.objectContaining({width, height}))
          const renderer = createSnapshotRenderer()
          const host = document.createElement('div')
          try {
            renderer.render(host, root(item))
            const surface = host.querySelector<HTMLElement>('.shape-block__shell, .text-box-block__surface, .word-art-block__surface')!
            expect(surface.style.width).toBe(`${width}px`)
            expect(surface.style.height).toBe(`${height}px`)
          } finally { renderer.destroy() }
        }
      })
    }
  }
})
