import {nextTick} from '../../../global'
import {SelectionHistoryRestorer, SelectionHistoryRestoreHost} from './history-restorer'
import {RelativeSelectionBookmark} from './relative-bookmark'
import {SelectionSurfaceAdapter} from './surface-adapter'
import {ISelectionJSON} from './types'

const selected = (blockId: string): ISelectionJSON => ({
  anchor: {type: 'selected', blockId},
  head: {type: 'selected', blockId},
  commonParent: blockId,
})

const bookmark = (selection: ISelectionJSON): RelativeSelectionBookmark => ({
  anchor: selection.anchor.type === 'selected'
    ? {type: 'selected', blockId: selection.anchor.blockId}
    : {type: 'table-cell', blockId: selection.anchor.blockId, tableId: selection.anchor.tableId!},
  head: selection.head.type === 'selected'
    ? {type: 'selected', blockId: selection.head.blockId}
    : {type: 'table-cell', blockId: selection.head.blockId, tableId: selection.head.tableId!},
  source: selection,
  dependencyBlockIds: new Set([selection.anchor.blockId, selection.head.blockId]),
  structuralPositions: [],
})

const waitFrames = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
}

describe('SelectionHistoryRestorer', () => {
  let blocks: Record<string, any>
  let doc: any
  let host: jasmine.SpyObj<SelectionHistoryRestoreHost>
  let surface: jasmine.SpyObj<SelectionSurfaceAdapter>
  let restorer: SelectionHistoryRestorer

  beforeEach(() => {
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0)
    })
    blocks = {
      first: {id: 'first'},
      second: {id: 'second'},
      late: {id: 'late'},
    }
    doc = {
      getBlockById: (id: string) => {
        const block = blocks[id]
        if (!block) throw new Error(`Block not found: ${id}`)
        return block
      },
    }
    host = jasmine.createSpyObj<SelectionHistoryRestoreHost>(
      'SelectionHistoryRestoreHost',
      [
        'replay',
        'readModelSelection',
        'readDomSelection',
      ],
    )
    surface = jasmine.createSpyObj<SelectionSurfaceAdapter>(
      'SelectionSurfaceAdapter',
      [
        'focusEditingHost',
        'hasEditorFocus',
        'isRootConnected',
        'requestFrame',
        'cancelFrame',
      ],
    )
    surface.hasEditorFocus.and.returnValue(true)
    surface.isRootConnected.and.returnValue(true)
    surface.requestFrame.and.callFake(callback => requestAnimationFrame(callback))
    surface.cancelFrame.and.callFake(frame => cancelAnimationFrame(frame))
    host.replay.and.callFake((selection: ISelectionJSON | null) => {
      host.readModelSelection.and.returnValue(selection)
      host.readDomSelection.and.returnValue(selection)
    })
    restorer = new SelectionHistoryRestorer(doc, host, surface)
  })

  afterEach(() => restorer.destroy())

  it('focuses synchronously and restores the bookmark after the view microtask', async () => {
    const expected = selected('first')

    restorer.restore(bookmark(expected))

    expect(surface.focusEditingHost).toHaveBeenCalledWith('first')
    expect(host.replay).not.toHaveBeenCalled()
    await nextTick()
    expect(host.replay).toHaveBeenCalledWith(expected)
  })

  it('retries until a restored block component becomes available', async () => {
    const expected = selected('late')
    let attempts = 0
    doc.getBlockById = (id: string) => {
      if (id !== 'late' || attempts++ === 0) throw new Error('not mounted yet')
      return blocks['late']
    }

    restorer.restore(bookmark(expected))
    await nextTick()
    expect(host.replay).not.toHaveBeenCalled()
    await waitFrames(1)

    expect(host.replay).toHaveBeenCalledWith(expected)
  })

  it('reprojects when focus is dropped after the first replay', async () => {
    const expected = selected('first')
    let replayCount = 0
    host.replay.and.callFake((selection: ISelectionJSON | null) => {
      host.readModelSelection.and.returnValue(selection)
      host.readDomSelection.and.returnValue(selection)
      replayCount += selection ? 1 : 0
      surface.hasEditorFocus.and.returnValue(replayCount > 1)
    })

    restorer.restore(bookmark(expected))
    await nextTick()
    await waitFrames(2)

    expect(replayCount).toBe(2)
  })

  it('reprojects when the DOM selection does not match the model selection', async () => {
    const expected = selected('first')
    const stale = selected('second')
    let replayCount = 0
    host.replay.and.callFake((selection: ISelectionJSON | null) => {
      host.readModelSelection.and.returnValue(selection)
      host.readDomSelection.and.returnValue(replayCount++ === 0 ? stale : selection)
    })

    restorer.restore(bookmark(expected))
    await nextTick()
    await waitFrames(2)

    expect(host.replay).toHaveBeenCalledTimes(2)
  })

  it('keeps only the newest pending history restore', async () => {
    restorer.restore(bookmark(selected('first')))
    restorer.restore(bookmark(selected('second')))

    await nextTick()

    expect(host.replay).toHaveBeenCalledTimes(1)
    expect(host.replay).toHaveBeenCalledWith(selected('second'))
  })

  it('fails closed when the bookmark can no longer resolve', async () => {
    const missing = selected('missing')

    restorer.restore(bookmark(missing))
    await nextTick()
    await waitFrames(3)

    expect(host.replay).toHaveBeenCalledOnceWith(null)
    expect(host.readDomSelection).not.toHaveBeenCalled()
  })

  it('does not require a native DOM selection for table-cell history', async () => {
    const tableSelection: ISelectionJSON = {
      anchor: {type: 'table-cell', blockId: 'cell-2', tableId: 'table'},
      head: {type: 'table-cell', blockId: 'cell-1', tableId: 'table'},
      commonParent: 'table',
    }
    blocks['table'] = {id: 'table', childrenIds: ['cell-1', 'cell-2']}
    blocks['cell-1'] = {id: 'cell-1', parentId: 'table'}
    blocks['cell-2'] = {id: 'cell-2', parentId: 'table'}

    restorer.restore(bookmark(tableSelection))
    await nextTick()
    await waitFrames(1)

    expect(host.replay).toHaveBeenCalledWith(tableSelection)
    expect(host.readDomSelection).not.toHaveBeenCalled()
  })
})
