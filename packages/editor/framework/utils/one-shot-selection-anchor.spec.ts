import * as Y from 'yjs'
import {BlockNodeType, EditableBlockComponent} from '../block-std'
import {BlockSelection} from '../modules/selection/blockSelection'
import {OneShotCursorAnchor, OneShotRangeAnchor} from './one-shot-selection-anchor'

describe('OneShot selection anchors', () => {
  const makeHarness = () => {
    const yDoc = new Y.Doc()
    const yText = yDoc.getText('p1')
    yText.insert(0, 'hello')

    const host = document.createElement('div')
    host.setAttribute('data-block-id', 'p1')
    const container = document.createElement('div')
    const textNode = document.createTextNode('hello')
    container.appendChild(textNode)
    host.appendChild(container)
    document.body.appendChild(host)

    const block = Object.create(EditableBlockComponent.prototype) as EditableBlockComponent
    Object.assign(block as any, {
      _native: {
        id: 'p1',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
      },
      _yText: yText,
      _containerElement: container,
      _runtime: {
        mapper: {
          domPointToModelPoint: jasmine.createSpy('domPointToModelPoint')
            .and.callFake((_root: Node, _node: Node, offset: number) => offset),
        },
      },
      hostElement: host,
      parentId: 'root',
    })

    const selection = new BlockSelection(
      {blockId: 'p1', type: 'text', offset: 2, block} as any,
      {blockId: 'p1', type: 'text', offset: 5, block} as any,
      'p1',
      () => block as any,
      () => 0,
    )
    const doc = {
      yDoc,
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        if (id !== 'p1') throw new Error(`missing block: ${id}`)
        return block
      }),
      isEditable: (candidate: unknown) => candidate === block,
      selection: {
        value: selection,
        recalculate: jasmine.createSpy('recalculate').and.throwError('unexpected DOM read'),
        normalizeRange: jasmine.createSpy('normalizeRange').and.throwError('unexpected legacy normalize'),
      },
    }

    return {block, container, doc, host, textNode}
  }

  afterEach(() => {
    document.querySelectorAll('[data-block-id="p1"]').forEach(node => node.remove())
  })

  it('captures cursor and range anchors from the model selection without recalculating DOM', () => {
    const {block, doc} = makeHarness()
    const cursor = new OneShotCursorAnchor(doc as any)
    const range = new OneShotRangeAnchor(doc as any)

    expect(cursor.captureFromSelection()).toBeTrue()
    expect(cursor.resolve()).toEqual({block, index: 2})
    expect(range.captureFromSelection()).toBeTrue()
    expect(range.resolve()).toEqual({block, index: 2, length: 3})
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
  })

  it('captures a cursor from StaticRange through model endpoints instead of the legacy manager facade', () => {
    const {block, doc, textNode} = makeHarness()
    const cursor = new OneShotCursorAnchor(doc as any)
    const range = new StaticRange({
      startContainer: textNode,
      startOffset: 3,
      endContainer: textNode,
      endOffset: 3,
    })

    expect(cursor.captureFromStaticRange(range)).toBeTrue()
    expect(cursor.resolve()).toEqual({block, index: 3})
    expect(doc.selection.normalizeRange).not.toHaveBeenCalled()
  })

  it('fails closed when the selected block is removed before anchor capture', () => {
    const {doc, textNode} = makeHarness()
    const cursor = new OneShotCursorAnchor(doc as any)
    const selectionRange = new OneShotRangeAnchor(doc as any)
    const staticRange = new StaticRange({
      startContainer: textNode,
      startOffset: 1,
      endContainer: textNode,
      endOffset: 1,
    })
    doc.getBlockById.and.throwError('Block not found: p1')

    expect(cursor.captureFromSelection()).toBeFalse()
    expect(cursor.resolve()).toBeNull()
    expect(selectionRange.captureFromSelection()).toBeFalse()
    expect(selectionRange.resolve()).toBeNull()
    expect(cursor.captureFromStaticRange(staticRange)).toBeFalse()
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
    expect(doc.selection.normalizeRange).not.toHaveBeenCalled()
  })
})
