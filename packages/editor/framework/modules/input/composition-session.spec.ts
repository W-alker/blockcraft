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
      textLength: text.length,
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
