import {Subject} from 'rxjs'
import * as Y from 'yjs'
import {BlockNodeType} from '../../types'
import {NativeBlockModel, native2YBlock, yBlock2Native} from '../../reactive'
import {EditableBlockComponent} from './editable-block'

describe('EditableBlockComponent retained view lifecycle', () => {
  it('destroys its live inline runtime only once when detached', () => {
    const harness = createEditableLifecycleHarness()

    harness.block.detach()
    harness.block.detach()

    expect(harness.initialRuntime.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys its live inline runtime when permanently removed while mounted', () => {
    const harness = createEditableLifecycleHarness()

    harness.block.ngOnDestroy()

    expect(harness.initialRuntime.destroy).toHaveBeenCalledTimes(1)
  })

  it('marks detached view patches dirty without touching the stale runtime', () => {
    const harness = createEditableLifecycleHarness()
    harness.block.detach()

    ;(harness.block as any)._applyDeltaToView([{insert: 'remote'}])

    expect(harness.block.dirtyWhileDetached).toBeTrue()
    expect(harness.initialRuntime.applyDelta).not.toHaveBeenCalled()
  })

  it('rebuilds a fresh runtime from current Yjs when reattached', () => {
    const harness = createEditableLifecycleHarness()
    harness.block.detach()
    harness.yText.insert(harness.yText.length, ' remote')

    harness.block.reattach()

    expect(harness.initRuntime).toHaveBeenCalledTimes(1)
    expect(harness.rebuiltRuntime.render).toHaveBeenCalledOnceWith([
      {insert: 'original remote'},
    ])
    expect(harness.block.dirtyWhileDetached).toBeFalse()
    expect(harness.block.isAttached).toBeTrue()
  })
})

function createEditableLifecycleHarness() {
  const yDoc = new Y.Doc()
  const yBlock = native2YBlock({
    id: 'paragraph',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {depth: 0},
    meta: {},
    children: [{insert: 'original'}],
  } as unknown as NativeBlockModel)
  yDoc.getMap('blocks').set('paragraph', yBlock)
  const yText = yBlock.get('children') as unknown as Y.Text
  const block = Object.create(EditableBlockComponent.prototype) as EditableBlockComponent
  const mutable = block as any
  const initialRuntime = createRuntimeSpy('initial')
  const rebuiltRuntime = createRuntimeSpy('rebuilt')
  const initRuntime = jasmine.createSpy('initRuntime').and.callFake(() => {
    mutable._runtime = rebuiltRuntime
  })

  Object.assign(block, {
    onViewInit$: new Subject<boolean>(),
    onDestroy$: new Subject<boolean>(),
    onDetach$: new Subject<void>(),
    onReattach$: new Subject<void>(),
    dirtyWhileDetached: false,
    hostElement: document.createElement('p'),
    changeDetectorRef: {
      detach: jasmine.createSpy('detach'),
      reattach: jasmine.createSpy('reattach'),
      markForCheck: jasmine.createSpy('markForCheck'),
    },
    doc: {
      config: {embeds: []},
      crud: {getYBlock: () => yBlock},
    },
  })
  mutable._native = yBlock2Native(yBlock)
  mutable._viewState = 'mounted'
  mutable._yBlock = yBlock
  mutable._runtime = initialRuntime
  mutable._containerElement = block.hostElement
  mutable._initRuntime = initRuntime
  block.applyReadonlyViewState = () => {}

  return {
    block,
    yText,
    initialRuntime,
    rebuiltRuntime,
    initRuntime,
  }
}

function createRuntimeSpy(name: string) {
  return {
    destroy: jasmine.createSpy(`${name}.destroy`),
    applyDelta: jasmine.createSpy(`${name}.applyDelta`),
    render: jasmine.createSpy(`${name}.render`),
  }
}
