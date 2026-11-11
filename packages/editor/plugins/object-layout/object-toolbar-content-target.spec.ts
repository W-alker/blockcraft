import {resolveObjectToolbarContentTarget} from './object-toolbar-content-target'
const resolveTarget = (doc: BlockCraft.Doc, selection: BlockCraft.Selection) => resolveObjectToolbarContentTarget(doc, selection, doc.interaction.value === 'design')

describe('design object toolbar ownership', () => {
  const tree: Record<string, [string, string | null]> = {
    root: ['root', null], box: ['text-box', 'root'], a: ['paragraph', 'box'], b: ['paragraph', 'box'],
    group: ['object-group', 'box'], member: ['shape', 'group'], text: ['shape-text', 'member'],
    bare: ['paragraph', 'group'], outside: ['paragraph', 'root'], region: ['render-unit', 'root'],
    nested: ['text-box', 'region'], inner: ['paragraph', 'nested'], art: ['word-art', 'root'],
  }
  const makeDoc = (mode = 'design', locked = '') => ({
    interaction: {value: mode}, isReadonly: false,
    model: {getFlavour: (id: string) => tree[id]?.[0], getParentId: (id: string) => tree[id]?.[1]},
    schemas: {get: (flavour: string) => ({metadata: {
      objectDrag: ['text-box', 'shape', 'word-art', 'render-unit', 'object-group'].includes(flavour) ? 'handles' : undefined,
    }})},
    readonlyManager: {isReadonly: (id: string) => id === locked},
  } as unknown as BlockCraft.Doc)
  const range = (anchor: string, head = anchor, type = 'text') => ({
    anchor: {blockId: anchor, type}, head: {blockId: head, type},
  } as BlockCraft.Selection)

  it('resolves a caret and a multi-paragraph range to their shared object', () => {
    expect(resolveTarget(makeDoc(), range('a'))).toBe('box')
    expect(resolveTarget(makeDoc(), range('a', 'b'))).toBe('box')
    expect(resolveTarget(makeDoc(), range('art'))).toBe('art')
  })
  it('uses the nearest nested object and allows members without selecting their group', () => {
    expect(resolveTarget(makeDoc(), range('inner'))).toBe('nested')
    expect(resolveTarget(makeDoc(), range('text'))).toBe('member')
    expect(resolveTarget(makeDoc(), range('bare'))).toBeNull()
    expect(resolveTarget(makeDoc(), range('group', 'group', 'boundary'))).toBeNull()
  })
  it('rejects crossing objects, gaps, missing targets and ordinary body text', () => {
    for (const selection of [range('a', 'outside'), range('a', 'text'), range('a', 'a', 'gap'), range('missing'), range('outside')]) {
      expect(resolveTarget(makeDoc(), selection)).toBeNull()
    }
  })
  it('keeps other modes and locked objects on their existing paths', () => {
    for (const mode of ['mixed', 'immersive']) expect(resolveTarget(makeDoc(mode), range('a'))).toBeNull()
    expect(resolveTarget(makeDoc('design', 'box'), range('a'))).toBeNull()
    const doc = makeDoc(); Object.defineProperty(doc, 'isReadonly', {value: true})
    expect(resolveTarget(doc, range('a'))).toBeNull()
  })
})
