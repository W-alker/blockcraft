import {ElementRef} from '@angular/core'
import {
  BlockResizeCommit,
  ResizeContainerComponent,
} from './resize-container'

describe('ResizeContainerComponent', () => {
  let host: HTMLElement
  let container: HTMLElement
  let handle: HTMLElement
  let component: ResizeContainerComponent

  beforeEach(() => {
    host = document.createElement('block-resizer')
    container = document.createElement('div')
    handle = document.createElement('div')
    container.append(host)
    document.body.append(container)
    Object.defineProperties(handle, {
      setPointerCapture: {value: jasmine.createSpy('setPointerCapture')},
      releasePointerCapture: {value: jasmine.createSpy('releasePointerCapture')},
    })
    spyOn(container, 'getBoundingClientRect').and.callFake(() => {
      const width = Number.parseFloat(container.style.width) || 400
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: width / 2,
        width,
        height: width / 2,
        toJSON: () => ({}),
      }
    })

    component = new ResizeContainerComponent(
      {
        runOutsideAngular: (fn: () => void) => fn(),
        run: <T>(fn: () => T) => fn(),
      } as any,
      new ElementRef(host),
    )
    component.container = container
    component.maxWidth = 800
  })

  afterEach(() => {
    component.ngOnDestroy()
    container.remove()
  })

  it('commits one pointer resize and keeps the current aspect ratio', () => {
    let result: BlockResizeCommit | undefined
    component.resizeCommit.subscribe(value => result = value)

    component.onHandlePointerDown({
      isPrimary: true,
      button: 0,
      pointerId: 7,
      clientX: 400,
      currentTarget: handle,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent, 'right')
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 7,
      clientX: 500,
      button: 0,
      isPrimary: true,
    }))

    expect(result).toEqual({
      width: 500,
      height: 250,
      offsetX: 0,
      basisWidth: 800,
    })
  })

  it('reports a left-edge offset for absolutely positioned objects', () => {
    component.preserveRightEdge = true
    let result: BlockResizeCommit | undefined
    component.resizeCommit.subscribe(value => result = value)

    component.onHandlePointerDown({
      isPrimary: true,
      button: 0,
      pointerId: 8,
      clientX: 100,
      currentTarget: handle,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent, 'left')
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 8,
      clientX: 200,
      button: 0,
      isPrimary: true,
    }))

    expect(result).toEqual({
      width: 300,
      height: 150,
      offsetX: 100,
      basisWidth: 800,
    })
    expect(container.style.transform).toBe('')
  })

  it('caps visual width by the parent while retaining a separate root basis', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'clientWidth', {value: 480})
    component.maxWidth = undefined
    component.maxWidthContainer = parent
    component.referenceWidth = 800
    let result: BlockResizeCommit | undefined
    component.resizeCommit.subscribe(value => result = value)

    component.onHandlePointerDown({
      isPrimary: true,
      button: 0,
      pointerId: 9,
      clientX: 400,
      currentTarget: handle,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as PointerEvent, 'right')
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 9,
      clientX: 900,
      button: 0,
      isPrimary: true,
    }))

    expect(result).toEqual({
      width: 480,
      height: 240,
      offsetX: 0,
      basisWidth: 800,
    })
  })
})
