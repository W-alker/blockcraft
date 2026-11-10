import {signal} from '@angular/core'
import {BehaviorSubject, Subject} from 'rxjs'
import {ShapeBlockComponent} from './shape.block'
import {normalizeShapeProps} from './shape.types'
import type {ShapeKind, SerializedCustomShapeGeometry} from './shape.types'
import {createDefaultEditableShapeGeometry, serializeCustomShapeGeometry} from './shape-geometry'

describe('Shape explicit point editing', () => {
  function harness(shape: ShapeKind = 'rectangle', customGeometry?: SerializedCustomShapeGeometry) {
    const block = Object.create(ShapeBlockComponent.prototype) as ShapeBlockComponent
    const selection = new Subject<any>(), locks = new Subject<void>(), propsChange = new Subject<void>()
    const destroy = new Subject<void>(), readonly = new BehaviorSubject(false)
    const props = {shape, customGeometry}
    let locked = false
    const updateObjectGeometry = jasmine.createSpy('updateObjectGeometry')
    Object.defineProperties(block, {
      id: {value: 'shape'},
      props: {get: () => props},
      isReadonly: {get: () => locked || readonly.value},
      shapeProps: {get: () => normalizeShapeProps(props)},
      onPropsChange: {value: propsChange}, onDestroy$: {value: destroy},
      doc: {value: {selection: {selectionChange$: selection}, readonlySwitch$: readonly,
        readonlyManager: {stateChange$: locks}, placement: {updateObjectGeometry}}},
      _pointEditing: {value: signal(false)},
    })
    return {block, props, selection, destroy, propsChange, readonly, updateObjectGeometry,
      lock: () => {locked = true; locks.next()}}
  }

  it('keeps default selection finite, and entering/exiting point mode never writes geometry', () => {
    const {block, updateObjectGeometry} = harness()
    expect(block.editableGeometry).toBeUndefined()
    expect(block.hasAdjustmentEditor).toBeFalse()
    expect(block.canEditPoints).toBeTrue()
    expect(block.setPointEditing(true)).toBeTrue()
    expect(block.editableGeometry?.paths.length).toBeGreaterThan(0)
    block.setPointEditing(false)
    expect(block.editableGeometry).toBeUndefined()
    expect(updateObjectGeometry).not.toHaveBeenCalled()
  })

  for (const shape of ['rounded-rectangle', 'right-arrow', 'triangle', 'trapezoid'] as const) {
    it(`${shape} retains bounded defaults and allows explicit point editing`, () => {
      const {block} = harness(shape)
      expect(block.hasAdjustmentEditor).toBeTrue()
      expect(block.editableGeometry).toBeUndefined()
      expect(block.canEditPoints).toBeTrue()
      const render = block.renderGeometry
      expect(block.setPointEditing(true)).toBeTrue()
      expect(block.hasAdjustmentEditor).toBeFalse()
      expect(block.editableGeometry).toBeDefined()
      expect(block.renderGeometry).toEqual(render)
      block.setPointEditing(false)
    })
  }

  it('renders existing custom curves unchanged outside point mode', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    geometry.width = 1200
    const {block, props} = harness('rectangle', serializeCustomShapeGeometry(geometry))
    const render = block.renderGeometry
    expect(block.canEditPoints).toBeTrue()
    expect(block.editableGeometry).toBeUndefined()
    block.setPointEditing(true)
    expect(block.editableGeometry).toEqual(geometry)
    block.setPointEditing(false)
    expect(block.renderGeometry).toEqual(render)
    expect(props.customGeometry).toBe(serializeCustomShapeGeometry(geometry))
  })

  for (const exit of ['selection', 'text', 'readonly', 'lock', 'shape', 'destroy']) {
    it(`exits on ${exit} and releases active-only observers`, () => {
      const h = harness()
      h.block.setPointEditing(true)
      h.selection.next(null) // Native toolbar focus gap retains ownership.
      expect(h.block.isEditingPoints).toBeTrue()
      switch (exit) {
        case 'selection': h.selection.next({isInSameBlock: true, firstBlock: {id: 'other'}}); break
        case 'text': h.selection.next({isInSameBlock: true, firstBlock: {id: 'shape'}, anchor: {type: 'text'}}); break
        case 'readonly': h.readonly.next(true); break
        case 'lock': h.lock(); break
        case 'shape': h.props.shape = 'diamond'; h.propsChange.next(); break
        case 'destroy': h.destroy.next(); break
      }
      expect(h.block.isEditingPoints).toBeFalse()
      expect(h.selection.observed).toBeFalse()
      expect(h.propsChange.observed).toBeFalse()
      expect(h.destroy.observed).toBeFalse()
    })
  }

  it('rejects stale geometry commits after leaving the mode', () => {
    const {block, updateObjectGeometry} = harness()
    block.onGeometryCommit(createDefaultEditableShapeGeometry('curved-connector')!)
    expect(updateObjectGeometry).not.toHaveBeenCalled()
  })
})
