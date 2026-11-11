import * as Y from 'yjs'
import {BlockNodeType, DeltaInsert} from '../../types'
import {native2YBlock, NativeBlockModel, yBlock2Native} from '../../reactive'
import {EmbedConverter, TextBlot} from '../../inline'
import {getLogicalLineAccess} from '../../inline/blot/logical-line-access'
import {InlineRuntime} from '../../inline/runtime/inline-runtime'
import {EditableBlockComponent} from './editable-block'

describe('EditableBlockComponent content consistency', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  })

  function createHarness(options: {
    logicalLines?: boolean
    plainTextOnly?: boolean
    deltas?: DeltaInsert[]
  } = {}) {
    const yDoc = new Y.Doc()
    const yBlock = native2YBlock({
      id: 'content',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: options.deltas ?? [{insert: 'first\nmiddle\nlast'}],
    } as unknown as NativeBlockModel)
    yDoc.getMap('blocks').set('content', yBlock)
    const yText = yBlock.get('children') as unknown as Y.Text
    const container = document.createElement('div')
    document.body.appendChild(container)
    const mention: EmbedConverter = {
      toView: delta => {
        const element = document.createElement('span')
        element.textContent = String(delta.insert['mention'])
        return element
      },
      toDelta: element => ({insert: {mention: element.textContent ?? ''}}),
    }
    const runtime = new InlineRuntime(container, new Map([['mention', mention]]), {
      lineContainerTag: options.logicalLines === false ? undefined : 'c-line',
    })
    const block = Object.create(EditableBlockComponent.prototype) as EditableBlockComponent
    const mutable = block as any
    const doc: any = {selection: {value: null}, crud: {getYBlock: () => yBlock}}
    Object.assign(mutable, {
      _native: yBlock2Native(yBlock),
      _yBlock: yBlock,
      _viewState: 'mounted',
      _containerElement: container,
      _runtime: runtime,
      hostElement: container,
      plainTextOnly: options.plainTextOnly !== false,
      doc,
      // Typography and retained host cleanup are unrelated to content checks.
      _projectEmptyTextDefaults: () => {},
      _pruneDuplicateHostClones: () => {},
    })
    block.rerender()
    const rerender = spyOn(block, 'rerender').and.callThrough()
    const verify = () => mutable._verifyBlotConsistency() as boolean
    const sync = (mutate: () => void) => {
      const observer = (event: Y.YTextEvent) => mutable._applyDeltaToView(event.delta)
      yText.observe(observer)
      try {
        mutate()
      } finally {
        yText.unobserve(observer)
      }
    }
    const text = () => Array.from(container.querySelectorAll('c-text'))
      .map(node => node.textContent ?? '').join('')
    cleanups.push(() => {
      runtime.destroy()
      container.remove()
      yDoc.destroy()
    })
    return {block, doc, yDoc, yText, runtime, container, rerender, verify, sync, text}
  }

  it('compares the complete Yjs value without rereading each healthy code leaf', () => {
    const harness = createHarness()
    harness.sync(() => harness.yText.insert(8, '🙂'))
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText())
      .toBe('first\nmi🙂ddle\nlast')
    const readText = spyOnProperty(TextBlot.prototype, 'text', 'get').and.callThrough()
    const readModel = spyOn(harness.yText, 'toDelta').and.callThrough()

    expect(harness.verify()).toBeTrue()

    expect(readModel).toHaveBeenCalledTimes(1)
    expect(readText).not.toHaveBeenCalled()
    expect(harness.rerender).not.toHaveBeenCalled()
  })

  it('rejects an equal-length model mismatch even when the code projection is trusted', () => {
    const harness = createHarness()
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText())
      .toBe('first\nmiddle\nlast')
    // A missed/skip-sync view patch must not be hidden by a healthy DOM cache.
    harness.yDoc.transact(() => {
      harness.yText.delete(0, 5)
      harness.yText.insert(0, 'other')
    })

    expect(harness.verify()).toBeFalse()
    harness.sync(() => harness.yText.insert(8, '!'))

    expect(harness.rerender).toHaveBeenCalledTimes(1)
    expect(harness.text()).toBe(harness.yText.toString())
  })

  it('repairs native same-length corruption outside the line receiving an edit', () => {
    const harness = createHarness()
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText()).toBeDefined()
    const last = harness.runtime.scrollBlot.leaves.find(
      leaf => leaf instanceof TextBlot && leaf.text === 'last',
    ) as TextBlot
    last.textNode.data = 'lost'

    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText()).toBeUndefined()
    harness.sync(() => harness.yText.insert(8, '!'))

    expect(harness.rerender).toHaveBeenCalledTimes(1)
    expect(harness.text()).toBe('first\nmi!ddle\nlast')
    expect(harness.verify()).toBeTrue()
  })

  it('retains DOM content checks on flat plain-text surfaces', () => {
    const harness = createHarness({logicalLines: false})
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)).toBeUndefined()
    const readText = spyOnProperty(TextBlot.prototype, 'text', 'get').and.callThrough()
    expect(harness.verify()).toBeTrue()
    expect(readText).toHaveBeenCalled()
    const leaf = harness.runtime.scrollBlot.leaves[0] as TextBlot
    leaf.textNode.data = 'other\nmiddle\nlast'

    expect(harness.verify()).toBeFalse()
  })

  it('retains DOM checks for rich-text surfaces even with logical line wrappers', () => {
    const harness = createHarness({plainTextOnly: false})
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText()).toBeDefined()
    const readText = spyOnProperty(TextBlot.prototype, 'text', 'get').and.callThrough()

    expect(harness.verify()).toBeTrue()

    expect(readText).toHaveBeenCalled()
  })

  it('retains full checks and one-character model accounting when code contains an embed', () => {
    const harness = createHarness({deltas: [
      {insert: 'first\n'}, {insert: {mention: 'person'}}, {insert: 'last'},
    ]})
    expect(getLogicalLineAccess(harness.runtime.scrollBlot)?.trustedPlainText()).toBeUndefined()
    const readText = spyOnProperty(TextBlot.prototype, 'text', 'get').and.callThrough()

    expect(harness.verify()).toBeTrue()
    expect(readText).toHaveBeenCalled()
    expect(harness.runtime.textLength).toBe(harness.yText.length)
    const first = harness.runtime.scrollBlot.leaves[0] as TextBlot
    first.textNode.data = 'other'
    expect(harness.verify()).toBeFalse()
  })

  it('keeps revision changes on their full canonical projection path', () => {
    const harness = createHarness()
    harness.doc.revisions = {
      hasTextRevisions: () => true,
      projectInlineDeltas: (_id: string, deltas: DeltaInsert[]) => deltas,
    }
    const apply = spyOn(harness.runtime, 'applyDelta').and.callThrough()
    const verify = spyOn(harness.block as any, '_verifyBlotConsistency').and.callThrough()

    harness.sync(() => harness.yText.insert(8, '修订'))

    expect(apply).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(harness.rerender).toHaveBeenCalledTimes(1)
    expect(harness.text()).toBe(harness.yText.toString())
  })

  it('compares local edits and undo/redo against the actual current model', () => {
    const harness = createHarness()
    const undo = new Y.UndoManager(harness.yText)
    cleanups.push(() => undo.destroy())
    harness.sync(() => harness.yText.insert(8, '中文🙂'))
    expect(harness.text()).toBe('first\nmi中文🙂ddle\nlast')
    expect(harness.verify()).toBeTrue()

    harness.sync(() => undo.undo())
    expect(harness.text()).toBe('first\nmiddle\nlast')
    expect(harness.verify()).toBeTrue()
    harness.sync(() => undo.redo())
    expect(harness.text()).toBe('first\nmi中文🙂ddle\nlast')
    expect(harness.verify()).toBeTrue()
    expect(harness.rerender).not.toHaveBeenCalled()
  })

  it('validates a remote Yjs delta through the same content path', () => {
    const harness = createHarness()
    const remote = new Y.Doc()
    cleanups.push(() => remote.destroy())
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(harness.yDoc))
    const remoteBlock = remote.getMap<Y.Map<unknown>>('blocks').get('content')!
    const remoteText = remoteBlock.get('children') as Y.Text
    remoteText.insert(8, '远端')

    harness.sync(() => Y.applyUpdate(harness.yDoc, Y.encodeStateAsUpdate(remote)))

    expect(harness.text()).toBe('first\nmi远端ddle\nlast')
    expect(harness.verify()).toBeTrue()
    expect(harness.rerender).not.toHaveBeenCalled()
  })
})
