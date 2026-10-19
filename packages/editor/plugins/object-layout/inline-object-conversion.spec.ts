import {
  ShapeBlockSchema,
  WordArtBlockSchema,
} from '../../blocks'
import {
  readInlineShapeDelta,
  readInlineWordArtDelta,
} from '../../embeds'
import {BlockNodeType, type IBlockSnapshot} from '../../framework'
import {
  inlineObjectSnapshotToBlockSnapshots,
  objectBlockSnapshotToInlineParagraph,
} from './inline-object-conversion'

describe('inline object conversion', () => {
  it('round-trips a shape with its nested text and wrap metadata', () => {
    const shape = ShapeBlockSchema.createSnapshot('diamond', '判断')
    shape.props = {...shape.props, width: 240, height: 120, rotation: 30}
    const paragraph = objectBlockSnapshotToInlineParagraph(shape, {
      wrap: true,
      x: 0.25,
      gap: 12,
    })!
    const embed = paragraph.children[0] as any
    expect(readInlineShapeDelta(embed)).toEqual(jasmine.objectContaining({
      width: 240,
      height: 120,
      wrap: true,
      x: 0.25,
      text: [{insert: '判断'}],
    }))

    const mixed: IBlockSnapshot = {
      ...paragraph,
      nodeType: BlockNodeType.editable,
      children: [{insert: '前'}, embed, {insert: '后'}],
    } as IBlockSnapshot
    const restored = inlineObjectSnapshotToBlockSnapshots(mixed, 1, 'shape')!
    expect(restored.snapshots.map(snapshot => snapshot.flavour)).toEqual([
      'paragraph',
      'shape',
      'paragraph',
    ])
    expect(restored.object.props['rotation']).toBe(30)
    expect((restored.object.children[0] as IBlockSnapshot).children)
      .toEqual([{insert: '判断'}])
  })

  it('round-trips WordArt as one atomic embed', () => {
    const wordArt = WordArtBlockSchema.createSnapshot('新品', {
      width: 260,
      height: 90,
      fontFamily: 'serif',
    })
    const paragraph = objectBlockSnapshotToInlineParagraph(wordArt)!
    expect(paragraph.nodeType).toBe(BlockNodeType.editable)
    expect(readInlineWordArtDelta(paragraph.children[0] as any))
      .toEqual(jasmine.objectContaining({
        width: 260,
        height: 90,
        text: [{insert: '新品'}],
      }))
    const restored = inlineObjectSnapshotToBlockSnapshots(
      paragraph,
      0,
      'word-art',
    )!
    expect(restored.snapshots).toEqual([restored.object])
    expect(restored.object.flavour).toBe('word-art')
    expect(restored.object.children).toEqual([{insert: '新品'}])
  })
})
