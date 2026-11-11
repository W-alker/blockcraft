import * as Y from 'yjs'
import {CompositionSession} from './composition-session'

function createHarness(order: string[]) {
  const yDoc = new Y.Doc()
  const blocks = yDoc.getMap<Y.Map<unknown>>('blocks')
  const root = new Y.Map<unknown>()
  const rootChildren = new Y.Array<string>()
  root.set('children', rootChildren)
  blocks.set('root', root)

  const blockViews = new Map<string, any>()
  order.forEach(id => {
    const block = new Y.Map<unknown>()
    const text = new Y.Text()
    text.insert(0, id)
    block.set('children', text)
    blocks.set(id, block)
    blockViews.set(id, {
      id,
      yText: text,
      get textLength() { return text.length },
      runtime: {
        acquireFloatLayoutFreeze: jasmine.createSpy(
          'acquireFloatLayoutFreeze',
        ).and.callFake(() => jasmine.createSpy('releaseFloatLayoutFreeze')),
      },
    })
  })
  rootChildren.insert(0, order)

  const doc = {
    yDoc,
    model: {
      exists: (id: string) => blocks.has(id),
      getYBlock: (id: string) => blocks.get(id),
      getParentId: (id: string) => order.includes(id) ? 'root' : null,
      getChildrenIds: (id: string) => id === 'root' ? rootChildren.toArray() : [],
    },
    getBlockById: (id: string) => blockViews.get(id),
    isEditable: (block: unknown) => !!block,
  }
  return {doc, blocks, rootChildren, blockViews}
}

describe('CompositionSession structural recovery', () => {
  it('holds one inline-layout freeze lease until the session ends', () => {
    const h = createHarness(['active'])
    const block = h.blockViews.get('active')
    const session = new CompositionSession(h.doc as any)

    session.start(block, 1)
    const release = block.runtime.acquireFloatLayoutFreeze
      .calls.mostRecent().returnValue
    expect(block.runtime.acquireFloatLayoutFreeze).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()

    session.end()
    session.reset()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('recovers at the next sibling start after the composing block is removed', () => {
    const h = createHarness(['previous', 'active', 'next'])
    const session = new CompositionSession(h.doc as any)
    session.start(h.blockViews.get('active'), 2)

    h.rootChildren.delete(1, 1)
    h.blocks.delete('active')
    session.handleBlocksDeleted(new Set(['active']))

    expect(session.consumeAbort()).toBeTrue()
    expect(session.consumeAbortRecovery()).toEqual({
      target: {
        blockId: 'next',
        atStart: true,
      },
    })
  })

  it('falls back to the previous sibling end when no next sibling survives', () => {
    const h = createHarness(['previous', 'active'])
    const session = new CompositionSession(h.doc as any)
    session.start(h.blockViews.get('active'), 1)

    h.rootChildren.delete(1, 1)
    h.blocks.delete('active')
    session.handleBlocksDeleted(new Set(['active']))

    expect(session.consumeAbort()).toBeTrue()
    expect(session.consumeAbortRecovery()).toEqual({
      target: {
        blockId: 'previous',
        atStart: false,
      },
    })
  })

  it('does not request structural recovery for an invalid composition start', () => {
    const h = createHarness(['active'])
    const session = new CompositionSession(h.doc as any)
    session.start(h.blockViews.get('active'), 1)

    session.abortPendingCommit()

    expect(session.consumeAbort()).toBeTrue()
    expect(session.consumeAbortRecovery()).toBeNull()
  })
})

describe('CompositionSession native caret ownership', () => {
  function createCaretHarness() {
    const h = createHarness(['active'])
    const block = h.blockViews.get('active')
    block.yText.delete(0, block.yText.length)
    block.yText.insert(0, 'first\nsecond')
    const session = new CompositionSession(h.doc as any)
    const releaseCaret = jasmine.createSpy('releaseCompositionCaret')
    block.runtime.acquireCompositionCaret = jasmine.createSpy('acquireCompositionCaret')
      .and.returnValue(releaseCaret)
    return {...h, block, session, releaseCaret}
  }

  it('captures a real relative anchor before acquiring the native caret and keeps it through remote edits', () => {
    const h = createCaretHarness()
    h.block.runtime.acquireCompositionCaret.and.callFake((offset: number) => {
      expect(offset).toBe(6)
      const accepted = h.session.resolveInsertionPoint(null)
      expect(accepted?.block).toBe(h.block)
      expect(accepted?.index).toBe(6)
      return h.releaseCaret
    })

    h.session.start(h.block, 6)
    h.doc.yDoc.transact(() => h.block.yText.insert(0, '远端'), 'remote')

    expect(h.session.resolveInsertionPoint(null)?.index).toBe(8)
    expect(h.releaseCaret).not.toHaveBeenCalled()
    h.session.end()
    expect(h.releaseCaret).toHaveBeenCalledTimes(1)
    h.doc.yDoc.destroy()
  })

  it('resolves the commit before releasing its native view and holds layout frozen until end', () => {
    const h = createCaretHarness()
    h.session.start(h.block, 6)
    const releaseFreeze = h.block.runtime.acquireFloatLayoutFreeze.calls.mostRecent().returnValue
    h.doc.yDoc.transact(() => h.block.yText.insert(0, '远'), 'remote')
    h.releaseCaret.and.callFake(() => {
      expect(h.session.phase).toBe('committing')
      // Cleanup can detach the old view. A commit must already hold the
      // resolved model point instead of looking the view up afterwards.
      h.blockViews.delete('active')
    })

    const point = h.session.prepareCommit(null)

    expect(point?.block).toBe(h.block)
    expect(point?.index).toBe(7)
    expect(h.releaseCaret).toHaveBeenCalledTimes(1)
    expect(releaseFreeze).not.toHaveBeenCalled()
    expect(h.session.activeBlockId).toBe('active')
    h.session.end()
    h.session.reset()
    expect(h.releaseCaret).toHaveBeenCalledTimes(1)
    expect(releaseFreeze).toHaveBeenCalledTimes(1)
    expect(h.session.isIdle).toBeTrue()
    h.doc.yDoc.destroy()
  })

  for (const exit of ['end', 'reset', 'abort', 'block deletion'] as const) {
    it(`releases the caret and layout once on ${exit}`, () => {
      const h = createCaretHarness()
      h.session.start(h.block, 6)
      const releaseFreeze = h.block.runtime.acquireFloatLayoutFreeze.calls.mostRecent().returnValue

      if (exit === 'end') h.session.end()
      else if (exit === 'reset') h.session.reset()
      else if (exit === 'abort') h.session.abortPendingCommit()
      else {
        h.rootChildren.delete(0, 1)
        h.blocks.delete('active')
        h.session.handleBlocksDeleted(new Set(['active']))
      }

      expect(h.session.isIdle).toBeTrue()
      expect(h.session.activeBlockId).toBeNull()
      expect(h.session.resolveInsertionPoint(null)).toBeNull()
      expect(h.session.consumeAbort()).toBe(exit === 'abort' || exit === 'block deletion')
      h.session.end()
      h.session.reset()
      expect(h.releaseCaret).toHaveBeenCalledTimes(1)
      expect(releaseFreeze).toHaveBeenCalledTimes(1)
      h.doc.yDoc.destroy()
    })
  }

  it('releases the old caret and both layout leases when a replacement acquisition fails', () => {
    const h = createCaretHarness()
    h.session.start(h.block, 6)
    const firstFreeze = h.block.runtime.acquireFloatLayoutFreeze.calls.mostRecent().returnValue
    h.block.runtime.acquireCompositionCaret.and.throwError('native anchor failed')

    expect(() => h.session.start(h.block, 6)).toThrowError('native anchor failed')

    const secondFreeze = h.block.runtime.acquireFloatLayoutFreeze.calls.mostRecent().returnValue
    expect(secondFreeze).not.toBe(firstFreeze)
    expect(h.session.isIdle).toBeTrue()
    expect(h.session.resolveInsertionPoint(null)).toBeNull()
    h.session.reset()
    expect(h.releaseCaret).toHaveBeenCalledTimes(1)
    expect(firstFreeze).toHaveBeenCalledTimes(1)
    expect(secondFreeze).toHaveBeenCalledTimes(1)
    h.doc.yDoc.destroy()
  })

  it('does not acquire a native caret when model anchor capture fails', () => {
    const h = createCaretHarness()
    spyOn(h.session.anchor, 'capture').and.throwError('model anchor unavailable')

    expect(() => h.session.start(h.block, 6)).toThrowError('model anchor unavailable')

    const releaseFreeze = h.block.runtime.acquireFloatLayoutFreeze.calls.mostRecent().returnValue
    expect(h.block.runtime.acquireCompositionCaret).not.toHaveBeenCalled()
    expect(h.releaseCaret).not.toHaveBeenCalled()
    expect(h.session.isIdle).toBeTrue()
    expect(h.session.activeBlockId).toBeNull()
    h.session.reset()
    expect(releaseFreeze).toHaveBeenCalledTimes(1)
    h.doc.yDoc.destroy()
  })
})
