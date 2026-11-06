import {GapApplier} from './gap-applier'

describe('GapApplier', () => {
  it('applies desired gaps only to mounted roots and replays them after remount', () => {
    const root = document.createElement('div')
    const first = document.createElement('div')
    const second = document.createElement('div')
    root.append(first, second)
    let blocks = new Map<string, {hostElement: HTMLElement}>([
      ['first', {hostElement: first}],
      ['second', {hostElement: second}],
    ])
    const doc = {
      getBlockById: (id: string, onError?: () => void) => {
        const block = blocks.get(id)
        if (block) return block
        onError?.()
        throw new Error(`Block not found: ${id}`)
      },
    } as unknown as BlockCraft.Doc
    const applier = new GapApplier(doc)

    applier.syncMounted(['first'])
    applier.apply(new Map([
      ['first', 40],
      ['second', 80],
    ]))

    expect(gapBefore(first)?.style.height).toBe('40px')
    expect(gapBefore(first)?.dataset['bcPageGapSpacer']).toBe('first')
    expect(gapBefore(second)).toBeNull()

    applier.syncMounted(['second'])
    expect(gapBefore(first)).toBeNull()
    expect(gapBefore(second)?.style.height).toBe('80px')

    const replacement = document.createElement('div')
    second.replaceWith(replacement)
    blocks = new Map([['second', {hostElement: replacement}]])
    applier.syncMounted([])
    applier.syncMounted(['second'])
    expect(gapBefore(second)).toBeNull()
    expect(gapBefore(replacement)?.style.height).toBe('80px')

    applier.destroy()
    expect(gapBefore(replacement)).toBeNull()
  })

  it('does not query an unmounted or deleted desired block', () => {
    const getBlockById = jasmine.createSpy('getBlockById').and.throwError('missing')
    const applier = new GapApplier({getBlockById} as unknown as BlockCraft.Doc)

    applier.syncMounted([])
    expect(() => applier.apply(new Map([['offscreen', 40]]))).not.toThrow()
    expect(getBlockById).not.toHaveBeenCalled()
  })

  it('keeps the page gap separate from the previous block bottom margin', () => {
    const root = document.createElement('div')
    const previous = document.createElement('div')
    const pageFirst = document.createElement('div')
    previous.style.height = '10px'
    previous.style.marginBottom = '12px'
    pageFirst.style.height = '10px'
    root.append(previous, pageFirst)
    document.body.append(root)
    const applier = new GapApplier({
      getBlockById: () => ({hostElement: pageFirst}),
    } as unknown as BlockCraft.Doc)

    try {
      applier.apply(new Map([['page-first', 40]]))

      expect(gapBefore(pageFirst)?.style.height).toBe('40px')
      expect(pageFirst.style.marginTop).toBe('')
      expect(pageFirst.getBoundingClientRect().top - previous.getBoundingClientRect().bottom)
        .toBeCloseTo(52, 0)
    } finally {
      applier.destroy()
      root.remove()
    }
  })
})

function gapBefore(host: HTMLElement): HTMLElement | null {
  const previous = host.previousElementSibling as HTMLElement | null
  return previous?.dataset['bcPageGapSpacer'] ? previous : null
}
