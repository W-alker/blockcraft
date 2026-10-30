import {TestBed} from '@angular/core/testing'
import {Subject} from 'rxjs'
import * as Y from 'yjs'
import {RenderUnitBlockSchema, resolveRenderUnitDimensions} from './index'

const RenderUnitBlockComponent = RenderUnitBlockSchema.component! as typeof import('./render-unit.block').RenderUnitBlockComponent

describe('RenderUnitBlockComponent sizing', () => {
  const fixture = (readonly = false, basis = 800) => ({
    id: 'region', isReadonly: readonly,
    doc: {objectSizing: {getReferenceWidth: () => basis}},
    updateProps: jasmine.createSpy('updateProps'),
  })

  it('commits the same wr/ar geometry as a flow image and clears legacy pixels', () => {
    const block = fixture()
    RenderUnitBlockComponent.prototype.setSize.call(block as any, 400, 200)
    expect(block.updateProps).toHaveBeenCalledOnceWith({wr: 50, ar: 2, width: null, height: null})
  })

  it('allows width and height to change independently', () => {
    const block = fixture()
    RenderUnitBlockComponent.prototype.setSize.call(block as any, 400, 100)
    expect(block.updateProps).toHaveBeenCalledOnceWith({wr: 50, ar: 4, width: null, height: null})
  })

  it('rejects readonly, invalid dimensions and unavailable sizing planes', () => {
    for (const [block, width, height] of [
      [fixture(true), 400, 200], [fixture(false, 0), 400, 200],
      [fixture(), 0, 200], [fixture(), 400, NaN], [fixture(), -10, 200],
      [fixture(), Infinity, 200],
    ] as const) {
      RenderUnitBlockComponent.prototype.setSize.call(block as any, width, height)
      expect(block.updateProps).not.toHaveBeenCalled()
    }
  })

  it('restores natural height for ratio and legacy sizes without touching width or appearance', () => {
    for (const props of [{wr: 50, ar: 2}, {width: 320, height: 200}]) {
      const block = {...fixture(), objectDimensions: resolveRenderUnitDimensions(props, 800)}
      RenderUnitBlockComponent.prototype.resetHeight.call(block as any)
      expect(block.updateProps).toHaveBeenCalledOnceWith({ar: null, height: null})
    }
  })

  it('does not write a redundant reset for natural height or a readonly region', () => {
    for (const block of [
      {...fixture(), objectDimensions: null},
      {...fixture(true), objectDimensions: {width: 400, height: 200}},
    ]) {
      RenderUnitBlockComponent.prototype.resetHeight.call(block as any)
      expect(block.updateProps).not.toHaveBeenCalled()
    }
  })

  it('freezes layout dimensions rather than transformed screen bounds and supports both directions', () => {
    const hostElement = document.createElement('div')
    Object.defineProperties(hostElement, {offsetWidth: {value: 320}, offsetHeight: {value: 120}})
    const block = {...fixture(), hostElement, objectDimensions: null as any,
      setSize: jasmine.createSpy('setSize'), resetHeight: jasmine.createSpy('resetHeight')}
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.setSize).toHaveBeenCalledOnceWith(320, 120)
    block.objectDimensions = {width: 320, height: 120}
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.resetHeight).toHaveBeenCalledTimes(1)
    block.isReadonly = true
    RenderUnitBlockComponent.prototype.toggleSizeMode.call(block as any)
    expect(block.resetHeight).toHaveBeenCalledTimes(1)
  })
})


describe('RenderUnitBlockComponent corner entry', () => {
  it('renders four selection corners without adding movement or making content non-editable', async () => {
    await TestBed.configureTestingModule({imports: [RenderUnitBlockComponent]}).compileComponents()
    const snapshot = RenderUnitBlockSchema.createSnapshot({}, {width: 300, height: 160})
    const yDoc = new Y.Doc()
    const yBlock = new Y.Map<unknown>()
    const props = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(snapshot.props)) props.set(key, value)
    yBlock.set('id', snapshot.id)
    yBlock.set('flavour', snapshot.flavour)
    yBlock.set('nodeType', snapshot.nodeType)
    yBlock.set('props', props)
    yBlock.set('meta', new Y.Map<unknown>())
    yBlock.set('children', new Y.Array<string>())
    yDoc.getMap('blocks').set(snapshot.id, yBlock)
    let readonly = false
    const selectBlock = jasmine.createSpy('selectBlock')
    const widthChange$ = new Subject<void>()
    const doc = {
      isReadonly: false,
      schemas: {get: () => RenderUnitBlockSchema},
      selection: {selectBlock},
      placement: {allowsGapCursor: () => false, registerBlockView: () => null},
      objectSizing: {getReferenceWidth: () => 800, widthChange$, rootContentElement: null},
      readonlyManager: {isReadonly: () => readonly, resolve: () => ({readonly, source: readonly ? {kind: 'document'} : null})},
    }
    const fixture = TestBed.createComponent(RenderUnitBlockComponent)
    fixture.componentRef.setInput('model', snapshot)
    fixture.componentRef.setInput('yBlock', yBlock)
    fixture.componentRef.setInput('doc', doc)
    const root = document.createElement('div')
    root.contentEditable = 'true'
    document.body.append(root)
    root.append(fixture.nativeElement)
    try {
      fixture.detectChanges()
      const content = fixture.nativeElement.querySelector('.render-unit-content') as HTMLElement
      const corners = fixture.nativeElement.querySelector('bc-object-corner-controls') as HTMLElement
      expect(content.isContentEditable).toBeTrue()
      expect(corners.getAttribute('contenteditable')).toBe('false')
      expect(corners.querySelectorAll('[data-bc-object-corner]').length).toBe(4)
      expect(corners.querySelectorAll('[data-bc-object-entry-edge]').length).toBe(0)
      ;(corners.querySelector('[data-bc-object-corner="nw"]') as HTMLButtonElement).click()
      expect(selectBlock).toHaveBeenCalledOnceWith(fixture.componentInstance)
      readonly = true
      fixture.componentInstance.applyReadonlyViewState()
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('bc-object-corner-controls')).toBeNull()
      expect(fixture.nativeElement.querySelector('shape-resizer')).toBeNull()
    } finally {
      fixture.destroy()
      root.remove()
      yDoc.destroy()
      widthChange$.complete()
      TestBed.resetTestingModule()
    }
  })

  it('preserves empty-region click selection without taking clicks inside populated content', () => {
    const target = document.createElement('div')
    for (const [childrenLength, nested] of [[0, false], [1, false], [0, true]] as const) {
      const selectBlock = jasmine.createSpy('selectBlock')
      const block = {childrenLength, doc: {selection: {selectBlock}}}
      const event = new MouseEvent('mousedown', {button: 0, cancelable: true})
      Object.defineProperties(event, {target: {value: nested ? document.createElement('p') : target}, currentTarget: {value: target}})
      ;(RenderUnitBlockComponent.prototype as any).selectEmptyRegion.call(block, event)
      expect(selectBlock.calls.count()).toBe(childrenLength === 0 && !nested ? 1 : 0)
      expect(event.defaultPrevented).toBe(childrenLength === 0 && !nested)
    }
  })
})
