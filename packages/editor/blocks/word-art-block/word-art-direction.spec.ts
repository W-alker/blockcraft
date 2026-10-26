import {WordArtBlockSchema} from './index'
import {type WordArtEffect} from './word-art.types'
import {createSnapshotRenderer} from '../../snapshot-viewer/create-snapshot-renderer'
import {createInlineWordArtDelta, inlineWordArtEmbedConverter, readInlineWordArtDelta} from '../../embeds/word-art'
import {finalizeWordArtCssForPrint} from '../../tools/export/print-word-art'

const effects: WordArtEffect[] = [
  'none', 'slant-left', 'slant-right', 'slant-up', 'slant-down',
  'perspective-left', 'perspective-right', 'perspective-up', 'perspective-down',
  'wide', 'narrow', 'tall', 'short', 'inflate', 'deflate',
  'arch-up', 'arch-down', 'circle', 'wave',
]

describe('WordArt direction projections', () => {
  it('does not share differently oriented inline path definitions', () => {
    const paths = (['vertical-rl', 'rotate-90'] as const).map(textDirection =>
      inlineWordArtEmbedConverter.toView(createInlineWordArtDelta({
        width: 180, height: 320, textDirection, textTransform: 'wave',
      }, [{insert: '艺术字ABC'}])).querySelector('path')!,
    )
    expect(paths[0].getAttribute('d')).toBe(paths[1].getAttribute('d'))
    expect(paths[0].id).not.toBe(paths[1].id)
  })

  for (const direction of ['horizontal', 'vertical-rl', 'rotate-90', 'rotate-270'] as const) {
    it(`preserves all effects in viewer, inline round-trip and print for ${direction}`, () => {
      const host = document.createElement('div')
      const renderer = createSnapshotRenderer({resourcePolicy: 'off'})
      try {
        for (const effect of effects) {
          const snapshot = WordArtBlockSchema.createSnapshot('艺术字ABC', {
            width: 180, height: 320, textDirection: direction, textTransform: effect,
          })
          renderer.render(host, snapshot)
          const embed = inlineWordArtEmbedConverter.toView(createInlineWordArtDelta(
            snapshot.props, [{insert: '艺术字ABC'}],
          ))
          const content = host.querySelector<HTMLElement>('.word-art-block__editor')!
          const inlineText = embed.querySelector<HTMLElement>('.bc-inline-word-art__text')!
          expect(content.style.writingMode).toBe(direction === 'vertical-rl' ? 'vertical-rl' : '')
          expect(content.style.transform).toBe(inlineText.style.transform)
          if (direction.startsWith('rotate-')) {
            expect(content.style.transform).toContain(`rotate(${direction.slice(7)}deg)`)
            expect(content.style.width).toBe('320px')
            expect(content.style.maxHeight).toBe('180px')
          }
          const projection = host.querySelector<SVGSVGElement>('svg')
          if (['arch-up', 'arch-down', 'circle', 'wave'].includes(effect)) {
            expect(projection).not.toBeNull()
            expect(projection!.getAttribute('viewBox')).toBe(
              direction.startsWith('rotate-') ? '0 0 320 180' : '0 0 180 320',
            )
            expect(projection!.querySelector('path')!.getAttribute('transform'))
              .toBe(direction === 'vertical-rl' ? 'matrix(0 1 -1 0 180 0)' : null)
            expect(projection!.querySelector('text')!.style.writingMode).toBe(content.style.writingMode)
            expect(embed.querySelector('path')!.getAttribute('d'))
              .toBe(projection!.querySelector('path')!.getAttribute('d'))
          } else {
            expect(projection).toBeNull()
            if (effect !== 'none') expect(content.style.transform).not.toBe('')
          }
          const roundtrip = readInlineWordArtDelta(inlineWordArtEmbedConverter.toDelta(embed))
          expect(roundtrip.props.textDirection ?? 'horizontal').toBe(direction)
          expect(roundtrip.props.textTransform ?? 'none').toBe(effect)
          const before = content.style.transform
          finalizeWordArtCssForPrint(host)
          expect(content.style.transform).toBe(before || 'none')
          expect(content.style.writingMode).toBe(direction === 'vertical-rl' ? 'vertical-rl' : '')
          expect(host.querySelector('svg')).toBe(projection)
        }
      } finally {
        renderer.destroy()
      }
    })
  }

  it('clears direction layout on snapshot updates back to horizontal', () => {
    const snapshot = WordArtBlockSchema.createSnapshot('测试', {
      width: 180, height: 320, textDirection: 'rotate-90', textTransform: 'wave',
    })
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer()
    renderer.render(host, snapshot)
    renderer.update({...snapshot, props: {...snapshot.props, textDirection: 'horizontal'}})
    const text = host.querySelector<HTMLElement>('.word-art-block__editor')!
    expect(text.style.position).toBe('')
    expect(text.style.transform).toBe('')
    expect(host.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 180 320')
    expect(host.querySelector('svg')!.style.transform).toBe('')
    renderer.destroy()
  })
})
