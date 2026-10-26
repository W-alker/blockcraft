import {BlockNodeType} from '../../../block-std/types/block.type'
import {registerInlinePaginationAccess} from '../../../block-std/inline/runtime/inline-pagination-access'
import type {PaginationResult} from '../engine'
import {
  computeInlinePaginationGaps,
  InlineBreakApplier,
} from './inline-break-applier'
import type {BlockMeta} from './item-builder'

const plan = {
  points: [
    {layoutOffset: 80, textOffset: 8},
    {layoutOffset: 150, textOffset: 15},
  ],
}

const result: PaginationResult = {
  pages: [
    {
      index: 0,
      usedHeight: 80,
      slots: [{id: 'text', fragment: {fromOffset: 0, toOffset: 80}}],
    },
    {
      index: 1,
      usedHeight: 70,
      slots: [{id: 'text', fragment: {fromOffset: 80, toOffset: 150}}],
    },
    {
      index: 2,
      usedHeight: 60,
      slots: [{id: 'text', fragment: {fromOffset: 150, toOffset: 210}}],
    },
  ],
  byBlock: new Map([['text', {pageIndex: 0}]]),
}

function meta(): BlockMeta {
  return {
    id: 'text',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    isHeading: false,
    height: 210,
    splitOffsets: [80, 150],
    inlineBreakPlan: plan,
  }
}

describe('InlineBreakApplier', () => {
  it('maps every continuation fragment to its Y.Text anchor and sheet gap', () => {
    expect(computeInlinePaginationGaps('text', plan, result, 100, 20, 10))
      .toEqual([
        {
          offset: 8,
          height: 40,
          backdropOffset: 10,
          backdropHeight: 20,
        },
        {
          offset: 15,
          height: 50,
          backdropOffset: 20,
          backdropHeight: 20,
        },
      ])
  })

  it('suspends and restores the previous projection idempotently', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      expect(apply).toHaveBeenCalledTimes(1)
      expect(applier.layoutOwnedIds).toEqual(new Set(['text']))

      const restore = applier.suspend()
      expect(clear).toHaveBeenCalledTimes(1)
      restore()
      restore()

      expect(apply).toHaveBeenCalledTimes(2)
      expect(clear).toHaveBeenCalledTimes(1)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('does not let a stale suspend restore overwrite a newer layout', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      const staleRestore = applier.suspend()
      applier.apply([meta()], result, 100, 20, 10)
      staleRestore()

      expect(apply).toHaveBeenCalledTimes(2)
      expect(clear).toHaveBeenCalledTimes(1)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('keeps the stable projection while a wrapped runtime is frozen and retries on release', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const ready = jasmine.createSpy('ready')
    let writable = true
    let notifyWritable: (() => void) | undefined
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
      projectionWritable: () => writable,
      whenProjectionWritable: listener => {
        notifyWritable = listener
        return () => {
          if (notifyWritable === listener) notifyWritable = undefined
        }
      },
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc, ready)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      writable = false

      expect(applier.deferUpdateWhileProjectionFrozen()).toBeTrue()
      expect(applier.deferUpdateWhileProjectionFrozen()).toBeTrue()
      expect(clear).not.toHaveBeenCalled()
      expect(apply).toHaveBeenCalledTimes(1)

      writable = true
      notifyWritable?.()
      expect(ready).toHaveBeenCalledTimes(1)
      expect(applier.deferUpdateWhileProjectionFrozen()).toBeFalse()
    } finally {
      applier.destroy()
      release()
    }
  })

  it('replays cached anchors after an async canonical renderer revokes the projection', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const ready = jasmine.createSpy('ready')
    let notifyInvalidated: (() => void) | undefined
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear: () => undefined,
      measureLineStarts: () => [],
      subscribeProjectionInvalidated: listener => {
        notifyInvalidated = listener
        return () => {
          if (notifyInvalidated === listener) notifyInvalidated = undefined
        }
      },
    })
    const applier = new InlineBreakApplier({
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc, ready)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      notifyInvalidated?.()

      expect(ready).toHaveBeenCalledTimes(1)
      applier.apply([meta()], result, 100, 20, 10)
      expect(apply).toHaveBeenCalledTimes(2)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('preflights a mounted frozen runtime before its first continuation', () => {
    const runtime = {}
    const ready = jasmine.createSpy('ready')
    let writable = false
    let notifyWritable: (() => void) | undefined
    const release = registerInlinePaginationAccess(runtime, {
      apply: () => true,
      clear: () => undefined,
      measureLineStarts: () => [],
      projectionWritable: () => writable,
      whenProjectionWritable: listener => {
        notifyWritable = listener
        return () => {
          if (notifyWritable === listener) notifyWritable = undefined
        }
      },
    })
    const applier = new InlineBreakApplier({
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc, ready)

    try {
      applier.syncMounted(['text'])
      expect(applier.layoutOwnedIds.size).toBe(0)
      expect(applier.deferUpdateWhileProjectionFrozen()).toBeTrue()

      writable = true
      notifyWritable?.()
      expect(ready).toHaveBeenCalledTimes(1)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('rolls back an uncommitted layout update to the previous projection', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      const previousGaps = apply.calls.mostRecent().args[0]
      const update = applier.beginUpdate()

      applier.apply([meta()], result, 120, 20, 10)
      expect(apply.calls.mostRecent().args[0]).not.toEqual(previousGaps)

      update.rollback()
      update.rollback()

      expect(apply).toHaveBeenCalledTimes(3)
      expect(apply.calls.mostRecent().args[0]).toEqual(previousGaps)
      expect(clear).toHaveBeenCalledTimes(2)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('reports a mounted runtime that cannot accept the requested projection', () => {
    const runtime = {}
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      expect(applier.apply([meta()], result, 100, 20, 10))
        .toEqual(new Set(['text']))
      expect(applier.layoutOwnedIds.size).toBe(1)
    } finally {
      applier.destroy()
    }
  })

  it('reports an engine continuation that has no matching text anchor', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear: () => undefined,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)
    const mismatched: PaginationResult = {
      ...result,
      pages: result.pages.map((page, index) => index !== 1
        ? page
        : {
            ...page,
            slots: [{
              id: 'text',
              fragment: {fromOffset: 81, toOffset: 150},
            }],
          }),
    }

    try {
      expect(applier.apply([meta()], mismatched, 100, 20, 10))
        .toEqual(new Set(['text']))
      expect(apply).not.toHaveBeenCalled()
    } finally {
      applier.destroy()
      release()
    }
  })

  it('clears unmounted runtimes and replays the cached plan after remount', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.syncMounted(['text'])
      applier.apply([meta()], result, 100, 20, 10)
      applier.syncMounted([])
      applier.syncMounted(['text'])

      expect(clear).toHaveBeenCalledTimes(1)
      expect(apply).toHaveBeenCalledTimes(2)
    } finally {
      applier.destroy()
      release()
    }
  })

  it('reports a cached projection failure when its root remounts', () => {
    const runtime = {}
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.syncMounted([])
      expect(applier.apply([meta()], result, 100, 20, 10).size).toBe(0)

      expect(applier.syncMounted(['text'])).toEqual(new Set(['text']))
    } finally {
      applier.destroy()
    }
  })

  it('does not treat stale text fragments without anchors as a live layout', () => {
    const applier = new InlineBreakApplier({
      getBlockById: () => null,
    } as unknown as BlockCraft.Doc)
    const staleMeta: BlockMeta = {
      ...meta(),
      splitOffsets: undefined,
      inlineBreakPlan: undefined,
    }

    try {
      applier.syncMounted([])
      expect(applier.apply([staleMeta], result, 100, 20, 10).size).toBe(0)

      expect(applier.syncMounted(['text'])).toEqual(new Set(['text']))
    } finally {
      applier.destroy()
    }
  })

  it('does not replay invalidated anchors when a dirty root remounts', () => {
    const runtime = {}
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    const release = registerInlinePaginationAccess(runtime, {
      apply,
      clear,
      measureLineStarts: () => [],
    })
    const doc = {
      getBlockById: () => ({runtime}),
    } as unknown as BlockCraft.Doc
    const applier = new InlineBreakApplier(doc)

    try {
      applier.apply([meta()], result, 100, 20, 10)
      applier.syncMounted([])
      applier.invalidate(['text'])
      applier.syncMounted(['text'])

      expect(clear).toHaveBeenCalledTimes(1)
      expect(apply).toHaveBeenCalledTimes(1)
      expect(applier.layoutOwnedIds.size).toBe(0)
    } finally {
      applier.destroy()
      release()
    }
  })
  it('scans page slots once instead of once per ordinary block', () => {
    let slotReads = 0
    let pageReads = 0
    const metas: BlockMeta[] = []
    const pages = Array.from({length: 64}, (_,pageIndex) => {
      const slots = Array.from({length: 16}, (_,slotIndex) => {
        const id = `plain-${pageIndex}-${slotIndex}`
        metas.push({...meta(), id, height: 20, splitOffsets: undefined,
          inlineBreakPlan: slotIndex % 2 ? {points: []} : undefined})
        return {get id() { slotReads++; return id }}
      })
      return {index: pageIndex, usedHeight: 320,
        get slots() { pageReads++; return slots }}
    })
    const getBlockById = jasmine.createSpy('getBlockById')
    const applier = new InlineBreakApplier({getBlockById} as unknown as BlockCraft.Doc)
    try {
      expect(applier.apply(metas, {pages, byBlock: new Map()}, 400, 20).size).toBe(0)
      // A deterministic complexity guard: independent of machine speed and JIT.
      expect(pageReads).toBeLessThanOrEqual(pages.length * 3)
      expect(slotReads).toBeLessThanOrEqual(metas.length * 3)
      expect(getBlockById).not.toHaveBeenCalled()
    } finally { applier.destroy() }
  })

  it('recognizes non-leading stale fragments without treating tables as inline text', () => {
    const applier = new InlineBreakApplier({getBlockById: () => null} as unknown as BlockCraft.Doc)
    const stale = {...meta(), inlineBreakPlan: undefined}
    const withNonLeading: PaginationResult = {
      pages: [{index: 0, usedHeight: 80, slots: [
        {id: 'whole'}, {id: 'text', fragment: {fromOffset: 0, toOffset: 80}},
        {id: 'table', fragment: {fromOffset: 0, toOffset: 80}},
      ]}], byBlock: new Map(),
    }
    try {
      expect(applier.apply([stale, {...stale, id: 'table', flavour: 'table'}], withNonLeading, 100, 20))
        .toEqual(new Set(['text']))
      expect(applier.apply([stale], {pages: [], byBlock: new Map()}, 100, 20).size).toBe(0)
      expect(applier.syncMounted(['text']).size).toBe(0)
    } finally { applier.destroy() }
  })

  it('indexes continuations separately for each block and excludes non-leading fragments', () => {
    const runtimes = new Map([['text', {}], ['other', {}]])
    const applies = new Map([...runtimes].map(([id]) => [id, jasmine.createSpy(id).and.returnValue(true)]))
    const releases = [...runtimes].map(([id, runtime]) => registerInlinePaginationAccess(runtime, {
      apply: applies.get(id)!, clear: () => undefined, measureLineStarts: () => [],
    }))
    const applier = new InlineBreakApplier({
      getBlockById: (id: string) => ({runtime: runtimes.get(id)}),
    } as unknown as BlockCraft.Doc)
    const mixed: PaginationResult = {
      pages: [
        {index: 0, usedHeight: 80, slots: [{id: 'text', fragment: {fromOffset: 0, toOffset: 80}}]},
        {index: 1, usedHeight: 90, slots: [
          {id: 'text', fragment: {fromOffset: 80, toOffset: 150}},
          {id: 'other', fragment: {fromOffset: 0, toOffset: 80}},
        ]},
        {index: 2, usedHeight: 70, slots: [
          {id: 'other', fragment: {fromOffset: 80, toOffset: 150}},
        ]},
      ], byBlock: new Map(),
    }
    try {
      expect(applier.apply([meta(), {...meta(), id: 'other'}], mixed, 100, 20, 10).size).toBe(0)
      expect(applies.get('text')!.calls.mostRecent().args[0])
        .toEqual(computeInlinePaginationGaps('text', plan, mixed, 100, 20, 10))
      expect(applies.get('other')!.calls.mostRecent().args[0])
        .toEqual(computeInlinePaginationGaps('other', plan, mixed, 100, 20, 10))
      expect(applies.get('text')!.calls.mostRecent().args[0][0].height).toBe(40)
      expect(applies.get('other')!.calls.mostRecent().args[0][0].height).toBe(30)
    } finally {
      applier.destroy()
      releases.forEach(release => release())
    }
  })

})
