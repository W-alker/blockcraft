import {
  deriveInitialImageObjectSize,
  ImageBlockComponent,
} from './image.block'

describe('deriveInitialImageObjectSize', () => {
  it('keeps a small image at its intrinsic width', () => {
    expect(deriveInitialImageObjectSize(
      {width: 320, height: 200, ar: 1.6},
      600,
      800,
    )).toEqual({
      wr: 40,
      ar: 1.6,
    })
  })

  it('caps a large image at the current parent width', () => {
    expect(deriveInitialImageObjectSize(
      {width: 1200, height: 600, ar: 2},
      480,
      800,
    )).toEqual({
      wr: 60,
      ar: 2,
    })
  })

  it('waits until parent and root widths are measurable', () => {
    const size = {width: 320, height: 200, ar: 1.6}

    expect(deriveInitialImageObjectSize(size, 0, 800)).toBeNull()
    expect(deriveInitialImageObjectSize(size, 600, 0)).toBeNull()
  })
})

describe('ImageBlockComponent local preview sizing', () => {
  function createComponent(
    rootWidth: () => number,
    parentWidth: number,
  ): {
    component: ImageBlockComponent;
    setInitProps: jasmine.Spy;
  } {
    const component = Object.create(ImageBlockComponent.prototype) as any
    component._props = {src: 'local://image', wr: 100}
    component.doc = {
      isReadonly: false,
      readonlyManager: {
        isReadonly: () => false,
      },
      objectSizing: {
        get rootContentWidth() {
          return rootWidth()
        },
      },
    }
    component.hostElement = document.createElement('div')
    Object.defineProperty(component.hostElement, 'clientWidth', {
      value: parentWidth,
    })
    component._awaitingLocalPreviewSize = true
    component._pendingIntrinsicSize = null
    spyOn(component, '_isGone').and.returnValue(false)
    const setInitProps = spyOn(component, 'setInitProps')
    return {component, setInitProps}
  }

  it('persists wr/ar from the first local preview without Undo history', () => {
    const {component, setInitProps} = createComponent(() => 800, 480)

    component.onImageIntrinsicSize({
      width: 1200,
      height: 600,
      ar: 2,
    })

    expect(setInitProps).toHaveBeenCalledOnceWith({wr: 60, ar: 2})
    expect((component as any)._awaitingLocalPreviewSize).toBeFalse()
  })

  it('defers the write until root width becomes measurable', () => {
    let rootWidth = 0
    const {component, setInitProps} = createComponent(
      () => rootWidth,
      480,
    )

    component.onImageIntrinsicSize({
      width: 320,
      height: 200,
      ar: 1.6,
    })
    expect(setInitProps).not.toHaveBeenCalled()

    rootWidth = 800
    expect((component as any).commitPendingIntrinsicSize()).toBeTrue()
    expect(setInitProps).toHaveBeenCalledOnceWith({wr: 40, ar: 1.6})
  })

  it('caps an inverse-expanded host width at the unscaled root width', () => {
    const {component} = createComponent(() => 800, 1200)

    expect((component as any).initialAvailableWidth).toBe(800)
  })

  it('backfills complete wr/ar for legacy data without responsive sizing', () => {
    const {component, setInitProps} = createComponent(() => 800, 600)
    ;(component as any)._props = {
      src: 'https://cdn.example.com/legacy.png',
    }
    ;(component as any)._awaitingLocalPreviewSize = false

    component.onImageIntrinsicSize({
      width: 320,
      height: 200,
      ar: 1.6,
    })

    expect(setInitProps).toHaveBeenCalledOnceWith({
      wr: 40,
      ar: 1.6,
    })
  })

  it('migrates legacy pixels without changing the current visual width', () => {
    const {component, setInitProps} = createComponent(() => 800, 480)
    ;(component as any)._props = {
      src: 'https://cdn.example.com/legacy.png',
      width: 640,
      height: 360,
    }
    ;(component as any)._awaitingLocalPreviewSize = false

    component.onImageIntrinsicSize({
      width: 1280,
      height: 720,
      ar: 16 / 9,
    })

    expect(setInitProps).toHaveBeenCalledOnceWith({
      wr: 60,
      ar: 16 / 9,
      width: null,
      height: null,
    })
  })

  it('keeps an existing wr and only backfills a missing ar', () => {
    const {component, setInitProps} = createComponent(() => 800, 480)
    ;(component as any)._props = {
      src: 'https://cdn.example.com/image.png',
      wr: 75,
    }
    ;(component as any)._awaitingLocalPreviewSize = false

    component.onImageIntrinsicSize({
      width: 1200,
      height: 600,
      ar: 2,
    })

    expect(setInitProps).toHaveBeenCalledOnceWith({ar: 2})
  })

  it('does not rewrite complete responsive sizing', () => {
    const {component, setInitProps} = createComponent(() => 800, 480)
    ;(component as any)._props = {
      src: 'https://cdn.example.com/image.png',
      wr: 75,
      ar: 2,
    }
    ;(component as any)._awaitingLocalPreviewSize = false

    component.onImageIntrinsicSize({
      width: 1200,
      height: 600,
      ar: 2,
    })

    expect(setInitProps).not.toHaveBeenCalled()
  })
})

describe('ImageBlockComponent rendered width', () => {
  function createComponent(width: number, rootContentWidth: number) {
    const component = Object.create(ImageBlockComponent.prototype) as any
    component._native = {flavour: 'image'}
    component._props = {src: 'https://cdn.example.com/image.png'}
    component.doc = {
      objectSizing: {
        rootContentWidth,
        resolve: () => ({width}),
      },
    }
    return component as ImageBlockComponent
  }

  it('caps legacy and responsive image widths at the root content width', () => {
    expect(createComponent(1200, 800).renderedWidth).toBe(800)
  })

  it('keeps narrower image widths unchanged', () => {
    expect(createComponent(480, 800).renderedWidth).toBe(480)
  })
})
