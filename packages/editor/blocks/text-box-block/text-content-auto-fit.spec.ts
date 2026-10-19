import {TextBoxBlockSchema, normalizeTextBoxProps, TEXT_BOX_OBJECT_FORMAT_CAPABILITY} from './index'
import {WordArtBlockSchema, normalizeWordArtProps, WORD_ART_OBJECT_FORMAT_CAPABILITY} from '../word-art-block'
import {objectFormatPropsFromHtml, objectFormatPropsToHtml} from '../../framework/block-std/block/adapter/object-format-properties'
import {resolveTextFit} from '../../framework/block-std/block/object-format/text-fit'
import {createSnapshotRenderer} from '../../snapshot-viewer'
import {BlockNodeType, type IBlockSnapshot} from '../../framework'

describe('text object fitted size persistence', () => {
  for (const kind of ['text-box', 'word-art'] as const) {
    it(`${kind} preserves authored dimensions through Schema, HTML and readonly preview`, () => {
      const schema = kind === 'text-box' ? TextBoxBlockSchema : WordArtBlockSchema
      const capability = kind === 'text-box' ? TEXT_BOX_OBJECT_FORMAT_CAPABILITY : WORD_ART_OBJECT_FORMAT_CAPABILITY
      const normalize = kind === 'text-box' ? normalizeTextBoxProps : normalizeWordArtProps
      const snapshot = schema.createSnapshot!('测试内容', {
        width: 260, height: 160, textAutoFit: 'resize-shape', textFit: 280,
      })
      expect(snapshot.props.height).toBe(160)
      expect(snapshot.props['textFit']).toBe(280)
      expect(normalize(snapshot.props as any).height).toBe(280)
      const properties = objectFormatPropsToHtml(snapshot.props as any, capability)
      const restored = objectFormatPropsFromHtml({type: 'element', tagName: 'figure', properties, children: []})
      expect(restored.height).toBe(160)
      expect(restored.textFit).toBe(280)
      expect(normalize(restored as any).height).toBe(280)
      expect(normalize({...restored, textAutoFit: 'none'} as any).height).toBe(160)

      const viewer = document.createElement('div')
      const renderer = createSnapshotRenderer()
      try {
        renderer.render(viewer, {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
          props: {}, meta: {}, children: [snapshot]} as IBlockSnapshot)
        const surface = viewer.querySelector<HTMLElement>(`.${kind}-block__surface`)!
        expect(surface.style.height).toBe('280px')
        expect(snapshot.props.height).toBe(160)
      } finally { renderer.destroy() }
    })
  }

  it('fits only the supported text object axis and bounds invalid measurements', () => {
    const props = {textAutoFit: 'resize-shape' as const, textFit: 100}
    expect(resolveTextFit({...props, textDirection: 'vertical-rl'}, TEXT_BOX_OBJECT_FORMAT_CAPABILITY))
      .toEqual({axis: 'width', size: 100})
    expect(resolveTextFit({...props, textTransform: 'circle'}, WORD_ART_OBJECT_FORMAT_CAPABILITY)).toBeNull()
    expect(resolveTextFit({...props, textDirection: 'rotate-90'}, TEXT_BOX_OBJECT_FORMAT_CAPABILITY)).toBeNull()
    expect(resolveTextFit(props, {...TEXT_BOX_OBJECT_FORMAT_CAPABILITY, kind: 'shape'})).toBeNull()
    for (const textFit of [NaN, Infinity, -5, 0])
      expect(resolveTextFit({...props, textFit}, TEXT_BOX_OBJECT_FORMAT_CAPABILITY)).toBeNull()
    expect(resolveTextFit({...props, textFit: 3000}, TEXT_BOX_OBJECT_FORMAT_CAPABILITY)?.size).toBe(2000)
  })
})
