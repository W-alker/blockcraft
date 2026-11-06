import type {NgZone} from '@angular/core'
import {ShapeResizerComponent} from './shape-resizer.component'

describe('Shape resizer availability', () => {
  it('cancels when resizeStart synchronously disables resizing, without capturing later events', () => {
    const outside = jasmine.createSpy('runOutsideAngular').and.callFake((callback: () => void) => callback())
    const resizer = new ShapeResizerComponent({run: (callback: () => void) => callback(), runOutsideAngular: outside} as unknown as NgZone)
    const target = document.createElement('div')
    target.style.width = '100px'
    target.style.height = '60px'
    const handle = document.createElement('button')
    handle.setPointerCapture = () => {}
    target.appendChild(handle)
    document.body.appendChild(target)
    resizer.target = target
    const commit = jasmine.createSpy('commit')
    const end = jasmine.createSpy('end')
    resizer.resizeCommit.subscribe(commit)
    resizer.resizeEnd.subscribe(end)
    resizer.resizeStart.subscribe(() => {resizer.resizeDisabledReason = '内容已锁定'})
    handle.addEventListener('pointerdown', event => resizer.onPointerDown(event, 'east'))
    try {
      handle.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, button: 0, clientX: 100}))
      window.dispatchEvent(new PointerEvent('pointermove', {pointerId: 1, clientX: 150}))
      window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, clientX: 150}))
      expect(outside).not.toHaveBeenCalled()
      expect(commit).not.toHaveBeenCalled()
      expect(end).toHaveBeenCalledTimes(1)
      expect(target.style.width).toBe('100px')
      expect(target.style.height).toBe('60px')
    } finally {
      resizer.ngOnDestroy()
      target.remove()
    }
  })
})
