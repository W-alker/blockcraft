import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  SHAPE_KINDS,
  ShapeBlockComponent,
  ShapeBlockSchema,
  ShapeIconComponent,
  ShapeResizerComponent,
  calculateShapeRotation,
  calculateShapeResize,
  normalizeShapeRotation,
  normalizeShapeProps,
  rotateShapeVector,
} from './index'
import {TestBed} from '@angular/core/testing'
import type {IBlockSnapshot} from '../../framework'

describe('Shape block domain', () => {
  it('estimates an unmounted flow block from its normalized model height', () => {
    const estimateHeight =
      ShapeBlockSchema.metadata.virtualization?.estimateHeight

    expect(estimateHeight).toBeDefined()
    expect(estimateHeight!({
      props: {
        ...ShapeBlockSchema.createSnapshot().props,
        height: 420,
      },
    } as any)).toBe(420)
    expect(estimateHeight!({
      props: {
        ...ShapeBlockSchema.createSnapshot().props,
        height: -1,
      },
    } as any)).toBe(32)
  })

  it('renders a theme-colored SVG icon from the shape geometry path', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeIconComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeIconComponent)
    const definition = SHAPE_DEFINITIONS[4]
    fixture.componentRef.setInput('path', definition.path)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const svg = host.querySelector('svg')
    const path = host.querySelector('path')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1000 1000')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(path?.getAttribute('d')).toBe(definition.path)
    expect(host.querySelector('.bc_icon')).toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('renders one drag-rotation handle above the resize outline', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeResizerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeResizerComponent)
    fixture.componentInstance.target = document.createElement('div')
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.hasAttribute('data-bc-placement-pick-ignore')).toBeTrue()
    expect(host.querySelectorAll('.shape-resizer__handle').length).toBe(8)
    expect(host.querySelector('.shape-resizer__rotation-stem')).not.toBeNull()
    expect(
      host
        .querySelector<HTMLButtonElement>('.shape-resizer__rotate')
        ?.getAttribute('aria-label'),
    ).toBe('旋转形状')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('adds four invisible move edges only when border dragging is enabled', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeResizerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeResizerComponent)
    fixture.componentRef.setInput('target', document.createElement('div'))
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('.shape-resizer__move-edge')).toBeNull()

    fixture.componentRef.setInput('borderDraggable', true)
    fixture.detectChanges()
    const edges = Array.from(
      host.querySelectorAll<HTMLElement>('.shape-resizer__move-edge'),
    )
    expect(edges.map((edge) => edge.dataset['moveEdge'])).toEqual([
      'north',
      'east',
      'south',
      'west',
    ])
    expect(
      edges.every((edge) => getComputedStyle(edge).pointerEvents === 'auto'),
    ).toBeTrue()
    expect(host.querySelectorAll('.shape-resizer__handle').length).toBe(8)

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('defines a categorized Word-like catalog with unique normalized shapes', () => {
    expect(SHAPE_DEFINITIONS.length).toBe(SHAPE_KINDS.length)
    expect(SHAPE_DEFINITIONS.length).toBeGreaterThan(90)
    expect(new Set(SHAPE_DEFINITIONS.map((item) => item.type)).size)
      .toBe(SHAPE_KINDS.length)
    expect(SHAPE_CATEGORIES.length).toBe(8)
    expect(SHAPE_CATEGORIES.every(category =>
      category.definitions.length > 0,
    )).toBeTrue()
    expect(SHAPE_CATEGORIES.flatMap(category => category.definitions))
      .toEqual(SHAPE_DEFINITIONS)
    for (const definition of SHAPE_DEFINITIONS) {
      expect(definition.path.startsWith('M')).toBeTrue()
      expect('icon' in definition).toBeFalse()
      for (const inset of Object.values(definition.textInsets)) {
        expect(inset).toBeGreaterThanOrEqual(0)
        expect(inset).toBeLessThan(0.5)
      }
    }
    const lines = SHAPE_CATEGORIES.find(category => category.id === 'lines')!
    expect(lines.definitions.length).toBeGreaterThanOrEqual(8)
    expect(lines.definitions.every(definition =>
      definition.fillable === false && definition.supportsText === false,
    )).toBeTrue()
  })

  it('does not create text in line-like shapes on double click', () => {
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', [
      'preventDefault',
      'stopPropagation',
    ])

    ShapeBlockComponent.prototype.onEditText.call(
      {
        isReadonly: false,
        definition: SHAPE_DEFINITIONS.find(item => item.type === 'line'),
      } as unknown as ShapeBlockComponent,
      event,
    )

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('creates an empty shape without an eager shape-text child', () => {
    const snapshot = ShapeBlockSchema.createSnapshot('right-arrow')

    expect(snapshot.flavour).toBe('shape')
    expect(snapshot.props.shapeType).toBe('right-arrow')
    expect(snapshot.props.width).toBe(180)
    expect(snapshot.props.height).toBe(100)
    expect(snapshot.props.rotation).toBe(0)
    expect(snapshot.children).toEqual([])
  })

  it('creates one collaborative shape-text child for explicit content', () => {
    const snapshot = ShapeBlockSchema.createSnapshot('right-arrow', '下一步')

    expect(snapshot.children.length).toBe(1)
    const text = snapshot.children[0] as IBlockSnapshot
    expect(text.flavour).toBe('shape-text')
    expect(text.children).toEqual([{insert: '下一步'}])
  })

  it('does not create shape-text for empty strings or empty deltas', () => {
    expect(ShapeBlockSchema.createSnapshot('rectangle', '').children).toEqual(
      [],
    )
    expect(ShapeBlockSchema.createSnapshot('rectangle', []).children).toEqual(
      [],
    )
    expect(
      ShapeBlockSchema.createSnapshot('rectangle', [{insert: ''}]).children,
    ).toEqual([])
  })

  it('creates and focuses shape-text only when an empty shape is edited', () => {
    const snapshot = {id: 'shape-text-1'}
    const chain = jasmine.createSpyObj('DocChain', [
      'insertSnapshots',
      'selectOrSetCursorAtBlock',
      'run',
    ])
    chain.insertSnapshots.and.returnValue(chain)
    chain.selectOrSetCursorAtBlock.and.returnValue(chain)
    const createSnapshot = jasmine
      .createSpy('createSnapshot')
      .and.returnValue(snapshot)
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', [
      'preventDefault',
      'stopPropagation',
    ])

    ShapeBlockComponent.prototype.onEditText.call(
      {
        isReadonly: false,
        firstChildren: null,
        id: 'shape-1',
        doc: {
          schemas: {createSnapshot},
          chain: () => chain,
        },
      } as unknown as ShapeBlockComponent,
      event,
    )

    expect(createSnapshot).toHaveBeenCalledOnceWith('shape-text', [])
    expect(chain.insertSnapshots).toHaveBeenCalledOnceWith('shape-1', 0, [
      snapshot,
    ])
    expect(chain.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith(
      'shape-text-1',
      true,
    )
    expect(chain.run).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('focuses existing shape text without creating another child', () => {
    const setInlineRange = jasmine.createSpy('setInlineRange')
    const chain = jasmine.createSpy('chain')
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', [
      'preventDefault',
      'stopPropagation',
    ])

    ShapeBlockComponent.prototype.onEditText.call(
      {
        isReadonly: false,
        firstChildren: {
          flavour: 'shape-text',
          textContent: () => '已有文字',
          setInlineRange,
        },
        doc: {chain},
      } as unknown as ShapeBlockComponent,
      event,
    )

    expect(setInlineRange).toHaveBeenCalledOnceWith(4)
    expect(chain).not.toHaveBeenCalled()
  })

  it('normalizes malformed external props without mutating the input', () => {
    const input: any = {
      shapeType: 'unknown',
      width: -20,
      height: Number.NaN,
      rotation: -450,
      fillColor: 'url(javascript:bad)',
      fillOpacity: 2,
      strokeWidth: -4,
      shapeTextAlign: 'justify',
      verticalAlign: 'baseline',
    }
    const normalized = normalizeShapeProps(input)

    expect(normalized.shapeType).toBe('rectangle')
    expect(normalized.width).toBe(48)
    expect(normalized.height).toBe(100)
    expect(normalized.rotation).toBe(270)
    expect(normalized.fillColor).toBe('#93C5FD')
    expect(normalized.fillOpacity).toBe(1)
    expect(normalized.strokeWidth).toBe(0)
    expect(normalized.shapeTextAlign).toBe('center')
    expect(normalized.verticalAlign).toBe('middle')
    expect(input.width).toBe(-20)
  })

  it('normalizes shape rotation without losing finite decimal precision', () => {
    expect(normalizeShapeRotation(360)).toBe(0)
    expect(normalizeShapeRotation(-15)).toBe(345)
    expect(normalizeShapeRotation(721.25)).toBe(1.25)
    expect(normalizeShapeRotation(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeShapeRotation('bad')).toBe(0)
  })

  it('calculates free rotation and Shift snapping across the angle seam', () => {
    expect(calculateShapeRotation(350, 0, 20)).toBe(10)
    expect(calculateShapeRotation(7, 0, 5, true)).toBe(15)
    expect(calculateShapeRotation(358, 179, -179)).toBe(0)
  })

  it('rotates screen and local resize vectors around the shape center', () => {
    const pageVector = rotateShapeVector({x: 40, y: 0}, 90)
    const localVector = rotateShapeVector({x: 0, y: 40}, -90)

    expect(pageVector.x).toBeCloseTo(0, 8)
    expect(pageVector.y).toBeCloseTo(40, 8)
    expect(localVector.x).toBeCloseTo(40, 8)
    expect(localVector.y).toBeCloseTo(0, 8)
  })

  it('keeps the opposite edge fixed for north-west resizing', () => {
    const result = calculateShapeResize(
      'north-west',
      {width: 180, height: 100, offsetX: 0, offsetY: 0},
      30,
      20,
    )

    expect(result).toEqual({
      width: 150,
      height: 80,
      offsetX: 30,
      offsetY: 20,
    })
  })

  it('clamps size and container width for every resize path', () => {
    expect(
      calculateShapeResize(
        'west',
        {width: 60, height: 40, offsetX: 0, offsetY: 0},
        100,
        0,
      ),
    ).toEqual({
      width: 48,
      height: 40,
      offsetX: 12,
      offsetY: 0,
    })
    expect(
      calculateShapeResize(
        'east',
        {width: 180, height: 100, offsetX: 0, offsetY: 0},
        200,
        0,
        240,
      ).width,
    ).toBe(240)
    expect(
      calculateShapeResize(
        'north',
        {width: 180, height: 40, offsetX: 0, offsetY: 0},
        0,
        100,
      ).height,
    ).toBe(32)
    expect(
      calculateShapeResize(
        'west',
        {width: 60, height: 40, offsetX: 0, offsetY: 0},
        100,
        0,
        0,
      ).width,
    ).toBe(48)
  })

  it('restores the exact inline size when resizing is cancelled', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '180px'
    target.style.height = '100px'
    target.style.transform = 'translate(2px, 3px)'
    target.style.fontSize = '48px'
    target.setAttribute('data-bc-scale-font-on-corner', '')
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      width: 180,
      height: 100,
    } as DOMRect)
    resizer.target = target

    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 8,
      clientX: 100,
      clientY: 100,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'west')

    target.style.width = '48px'
    target.style.height = '32px'
    target.style.transform = 'translate(132px, 68px)'
    target.style.fontSize = '12px'
    ;(resizer as any)._onPointerCancel(
      new PointerEvent('pointercancel', {
        pointerId: 8,
      }),
    )

    expect(target.style.width).toBe('180px')
    expect(target.style.height).toBe('100px')
    expect(target.style.transform).toBe('translate(2px, 3px)')
    expect(target.style.fontSize).toBe('48px')
  })

  it('previews scalable content font size with a corner resize', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '320px'
    target.style.height = '96px'
    target.style.fontSize = '48px'
    target.setAttribute('data-bc-scale-font-on-corner', '')
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 96,
    } as DOMRect)
    resizer.target = target

    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 18,
      clientX: 320,
      clientY: 96,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'south-east')
    ;(resizer as any)._onPointerUp(
      new PointerEvent('pointerup', {
        pointerId: 18,
        clientX: 480,
        clientY: 144,
      }),
    )

    expect(target.style.width).toBe('480px')
    expect(target.style.height).toBe('144px')
    expect(target.style.fontSize).toBe('72px')
  })

  it('commits the pointerup coordinates even before the preview frame runs', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      width: 180,
      height: 100,
    } as DOMRect)
    resizer.target = target

    const commits: any[] = []
    resizer.resizeCommit.subscribe((event) => commits.push(event))
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'south-east')

    const up = new PointerEvent('pointerup', {
      pointerId: 7,
      clientX: 140,
      clientY: 130,
    })
    ;(resizer as any)._onPointerUp(up)

    expect(commits).toEqual([
      {
        width: 220,
        height: 130,
        offsetX: 0,
        offsetY: 0,
        handle: 'south-east',
      },
    ])
    expect(target.style.width).toBe('220px')
    expect(target.style.height).toBe('130px')
    expect(target.style.transform).toBe('')
  })

  it('normalises resize pointer deltas through the measured container scale', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '180px'
    target.style.height = '100px'
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 360,
      height: 200,
    } as DOMRect)
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {value: 500})
    spyOn(container, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1200,
    } as DOMRect)
    resizer.target = target
    resizer.maxWidthContainer = container

    const commits: any[] = []
    resizer.resizeCommit.subscribe((event) => commits.push(event))
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 27,
      clientX: 100,
      clientY: 100,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'south-east')

    ;(resizer as any)._onPointerUp(new PointerEvent('pointerup', {
      pointerId: 27,
      clientX: 180,
      clientY: 160,
    }))

    expect(commits).toEqual([{
      width: 220,
      height: 130,
      offsetX: 0,
      offsetY: 0,
      handle: 'south-east',
    }])
  })

  it('commits the final drag rotation once and restores preview ownership', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '100px'
    target.style.height = '100px'
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect)
    resizer.target = target

    const commits: any[] = []
    resizer.rotateCommit.subscribe((event) => commits.push(event))
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 9,
      clientX: 50,
      clientY: 0,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onRotatePointerDown(down)
    ;(resizer as any)._onPointerUp(
      new PointerEvent('pointerup', {
        pointerId: 9,
        clientX: 100,
        clientY: 50,
      }),
    )

    expect(commits).toEqual([{rotation: 90}])
    expect(target.style.transform).toBe('')
  })

  it('uses the rotated local axis for resize pointer movement', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '180px'
    target.style.height = '100px'
    target.style.transform = 'rotate(90deg)'
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 180,
    } as DOMRect)
    resizer.target = target
    resizer.rotation = 90

    const commits: any[] = []
    resizer.resizeCommit.subscribe((event) => commits.push(event))
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 10,
      clientX: 100,
      clientY: 100,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'east')
    ;(resizer as any)._onPointerUp(
      new PointerEvent('pointerup', {
        pointerId: 10,
        clientX: 100,
        clientY: 140,
      }),
    )

    expect(commits.length).toBe(1)
    expect(commits[0].width).toBeCloseTo(220, 8)
    expect(commits[0].height).toBeCloseTo(100, 8)
    expect(commits[0].offsetX).toBeCloseTo(0, 8)
    expect(commits[0].offsetY).toBeCloseTo(0, 8)
    expect(target.style.transform).toBe('rotate(90deg)')
  })

  it('keeps flow-layout previews on the same layout anchor', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '180px'
    target.style.height = '100px'
    target.style.transform = 'rotate(20deg)'
    target.setAttribute('data-bc-resize-preview-anchor', 'layout')
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 204,
      height: 156,
    } as DOMRect)
    resizer.target = target
    resizer.rotation = 20

    const commits: any[] = []
    resizer.resizeCommit.subscribe((event) => commits.push(event))
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 19,
      clientX: 0,
      clientY: 0,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onPointerDown(down, 'west')
    ;(resizer as any)._onPointerUp(
      new PointerEvent('pointerup', {
        pointerId: 19,
        clientX: 20,
        clientY: 0,
      }),
    )

    expect(commits.length).toBe(1)
    expect(commits[0].offsetX).toBe(0)
    expect(commits[0].offsetY).toBe(0)
    expect(target.style.transform).toBe('rotate(20deg)')
  })

  it('cancels drag rotation on Escape without emitting a commit', () => {
    const zone = {
      runOutsideAngular: (fn: () => void) => fn(),
      run: (fn: () => void) => fn(),
    } as any
    const resizer = new ShapeResizerComponent(zone)
    const target = document.createElement('div')
    target.style.width = '100px'
    target.style.height = '100px'
    target.style.transform = 'rotate(30deg)'
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect)
    resizer.target = target
    resizer.rotation = 30

    const emit = spyOn(resizer.rotateCommit, 'emit')
    const handle = document.createElement('button')
    spyOn(handle, 'setPointerCapture')
    const down = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 11,
      clientX: 50,
      clientY: 0,
    })
    Object.defineProperty(down, 'currentTarget', {value: handle})
    resizer.onRotatePointerDown(down)
    target.style.transform = 'rotate(75deg)'
    ;(resizer as any)._onKeyDown(
      new KeyboardEvent('keydown', {
        key: 'Escape',
      }),
    )

    expect(emit).not.toHaveBeenCalled()
    expect(target.style.transform).toBe('rotate(30deg)')
  })

  it('keeps committed DOM size while persisting shape props', () => {
    const shell = document.createElement('div')
    shell.style.width = '48px'
    shell.style.height = '32px'
    shell.style.transform = 'translate(132px, 0px)'
    const updateObjectGeometry = jasmine.createSpy('updateObjectGeometry')
    const context = {
      isReadonly: false,
      shapeProps: {},
      doc: {placement: {updateObjectGeometry}},
      id: 'shape-1',
      _shapeShell: {nativeElement: shell},
    } as unknown as ShapeBlockComponent

    ShapeBlockComponent.prototype.onResizeCommit.call(
      context,
      {
        width: 48,
        height: 32,
        offsetX: 132,
        offsetY: 0,
        handle: 'west',
      },
    )

    expect(updateObjectGeometry).toHaveBeenCalledOnceWith(context, {
      width: 48,
      height: 32,
    })
    expect(shell.style.width).toBe('48px')
    expect(shell.style.height).toBe('32px')
    expect(shell.style.transform).toBe('')
  })

  it('preserves absolute opposite-edge compensation on west resize', () => {
    const shell = document.createElement('div')
    shell.style.width = '120px'
    shell.style.height = '80px'
    const updateObjectGeometry = jasmine.createSpy('updateObjectGeometry')
    const context = {
      isReadonly: false,
      shapeProps: {},
      doc: {
        placement: {
          getState: () => ({
            mode: 'absolute',
            x: 10,
            y: 20,
            layer: 'over',
          }),
          updateObjectGeometry,
        },
      },
      id: 'shape-1',
      _shapeShell: {nativeElement: shell},
    } as unknown as ShapeBlockComponent

    ShapeBlockComponent.prototype.onResizeCommit.call(
      context,
      {
        width: 120,
        height: 80,
        offsetX: 20,
        offsetY: 5,
        handle: 'west',
      },
    )

    expect(updateObjectGeometry).toHaveBeenCalledOnceWith(context, {
      width: 120,
      height: 80,
      position: {x: 30, y: 25},
    })
  })

  it('persists a rotation commit through shape props', () => {
    const shell = document.createElement('div')
    const updateObjectGeometry = jasmine.createSpy('updateObjectGeometry')
    const context = {
      isReadonly: false,
      doc: {placement: {updateObjectGeometry}},
      _shapeShell: {nativeElement: shell},
    } as unknown as ShapeBlockComponent

    ShapeBlockComponent.prototype.onRotateCommit.call(
      context,
      {
        rotation: 37.5,
      },
    )

    expect(updateObjectGeometry).toHaveBeenCalledOnceWith(
      context,
      {rotation: 37.5},
    )
    expect(shell.style.transform).toBe('rotate(37.5deg)')
  })
})
