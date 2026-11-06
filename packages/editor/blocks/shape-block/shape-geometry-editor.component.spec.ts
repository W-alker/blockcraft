import {TestBed} from '@angular/core/testing'
import {ShapeGeometryEditorComponent} from './shape-geometry-editor.component'
import {createDefaultEditableShapeGeometry, normalizeCustomShapeGeometry, serializeCustomShapeGeometry, shapePathCommandsToSvgData} from './shape-geometry'

describe('Shape geometry gestures', () => {
  async function setup() {
    await TestBed.configureTestingModule({imports: [ShapeGeometryEditorComponent]}).compileComponents()
    const fixture = TestBed.createComponent(ShapeGeometryEditorComponent)
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    const target = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS(target.namespaceURI, 'path')
    path.setAttribute('data-bc-shape-render-path', '')
    const original = shapePathCommandsToSvgData(geometry.paths[0]!.commands)
    path.setAttribute('d', original)
    target.append(path)
    fixture.componentRef.setInput('targetSvg', target)
    fixture.componentRef.setInput('shapeType', 'curved-connector')
    fixture.componentRef.setInput('geometry', geometry)
    const host = fixture.nativeElement as HTMLElement
    host.style.cssText = 'display:block;position:fixed;left:40px;top:40px;width:200px;height:200px'
    fixture.detectChanges()
    const handle = fixture.componentInstance.handles.find(item => item.commandIndex === 1 && item.point === 'node')!
    const button = host.querySelector<HTMLButtonElement>(`[data-geometry-handle-id="${handle.id}"]`)!
    spyOn(button, 'setPointerCapture').and.stub()
    const box = button.getBoundingClientRect()
    // Click away from the center to catch accidental no-motion node snapping.
    const x = box.left + box.width / 2 + 2, y = box.top + box.height / 2 + 2
    const pointer = (type: string, px = x, py = y) => new PointerEvent(type, {pointerId: 7, button: 0, clientX: px, clientY: py, bubbles: true})
    const emit = spyOn(fixture.componentInstance.geometryCommit, 'emit')
    const down = () => button.dispatchEvent(pointer('pointerdown'))
    return {fixture, path, original, pointer, emit, down, x, y}
  }

  it('does not materialize custom geometry from a click without movement', async () => {
    const scene = await setup()
    scene.down()
    window.dispatchEvent(scene.pointer('pointerup'))
    expect(scene.emit).not.toHaveBeenCalled()
    expect(scene.path.getAttribute('d')).toBe(scene.original)
    scene.fixture.destroy()
  })

  it('restores the preview without a commit when a node is dragged back', async () => {
    const scene = await setup()
    scene.down()
    window.dispatchEvent(scene.pointer('pointermove', scene.x + 30, scene.y + 10))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(scene.path.getAttribute('d')).not.toBe(scene.original)
    window.dispatchEvent(scene.pointer('pointerup'))
    expect(scene.emit).not.toHaveBeenCalled()
    expect(scene.path.getAttribute('d')).toBe(scene.original)
    scene.fixture.destroy()
  })

  it('commits the final pointer position once and cancels later gestures cleanly', async () => {
    const scene = await setup()
    scene.down()
    window.dispatchEvent(scene.pointer('pointerup', scene.x + 30, scene.y + 10))
    expect(scene.emit).toHaveBeenCalledTimes(1)
    const geometry = scene.emit.calls.mostRecent().args[0]
    expect(normalizeCustomShapeGeometry(serializeCustomShapeGeometry(geometry))).toEqual(geometry)
    expect(scene.path.getAttribute('d')).not.toBe(scene.original)
    scene.fixture.detectChanges()
    scene.down()
    window.dispatchEvent(scene.pointer('pointercancel'))
    expect(scene.emit).toHaveBeenCalledTimes(1)
    scene.fixture.destroy()
    window.dispatchEvent(scene.pointer('pointerup', scene.x + 50, scene.y + 50))
    expect(scene.emit).toHaveBeenCalledTimes(1)
  })
})
