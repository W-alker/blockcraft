import {ContextMenuPlugin} from './index'

describe('ContextMenuPlugin shape point mode', () => {
  function harness(flavour = 'shape', editing = true) {
    const plugin = new ContextMenuPlugin()
    const shape = {id: 'shape', flavour: 'shape', isEditingPoints: editing,
      setPointEditing: jasmine.createSpy('setPointEditing')}
    const text = {id: 'text', flavour}
    const block = flavour === 'shape' ? shape : text
    ;(plugin as any).doc = {vm: {get: (id: string) => ({instance: id === 'shape' ? shape : block})},
      model: {getParentId: () => 'shape'}}
    const selection = {isInSameBlock: true, firstBlock: {id: flavour === 'shape' ? 'shape' : 'text'}}
    const ctx = {get: () => ({selection}), preventDefault: jasmine.createSpy('preventDefault')}
    return {plugin, shape, ctx}
  }

  it('resolves the live shape and handles Escape without a floating toolbar', () => {
    const {plugin, shape, ctx} = harness()
    expect(plugin.onShapePointsEscape(ctx as any)).toBeTrue()
    expect(shape.setPointEditing).toHaveBeenCalledOnceWith(false)
    expect(ctx.preventDefault).toHaveBeenCalled()
  })

  for (const flavour of ['paragraph', 'text-box']) {
    it(`keeps Escape unchanged for ${flavour}`, () => {
      const {plugin, shape, ctx} = harness(flavour)
      expect(plugin.onShapePointsEscape(ctx as any)).toBeUndefined()
      expect(shape.setPointEditing).not.toHaveBeenCalled()
      expect(ctx.preventDefault).not.toHaveBeenCalled()
    })
  }

  it('keeps Escape unchanged outside point mode', () => {
    const {plugin, ctx} = harness('shape', false)
    expect(plugin.onShapePointsEscape(ctx as any)).toBeUndefined()
    expect(ctx.preventDefault).not.toHaveBeenCalled()
  })

  it('finds a shape from its internal text without changing the text selection', () => {
    const {plugin, shape, ctx} = harness('shape-text', false)
    expect((plugin as any).resolvePointShape(ctx.get().selection)).toBe(shape)
    expect(shape.setPointEditing).not.toHaveBeenCalled()
  })
})
