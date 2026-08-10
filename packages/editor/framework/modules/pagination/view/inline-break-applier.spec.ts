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
})
