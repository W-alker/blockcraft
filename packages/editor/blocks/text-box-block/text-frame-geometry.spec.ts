import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import * as Y from 'yjs'
import {
  BlockNodeType, DEFAULT_OBJECT_TEXT_FRAME, storeObjectTextFrame,
  type IBlockSnapshot,
} from '../../framework'
import {createSnapshotRenderer} from '../../snapshot-viewer'
import {createInlineShapeDelta, inlineShapeEmbedConverter} from '../../embeds/shape'
import {ShapeBlockComponent, ShapeBlockSchema, type ShapeKind} from '../shape-block'
import {TextBoxBlockComponent, TextBoxBlockSchema, getTextBoxPreset} from './index'

@Component({
  selector: 'text-frame-geometry-styles', standalone: true, template: '',
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../themes/base.scss',
})
class TextFrameGeometryStyles {}

/** Uses real renderer DOM and the shipped theme, including fixed-frame clipping. */
describe('shape text rectangles and user margins', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextFrameGeometryStyles, TextBoxBlockComponent, ShapeBlockComponent],
    }).compileComponents()
  })

  const cases: {shape: ShapeKind; adjustments?: Record<string, number>; insets: number[]}[] = [
    {shape: 'rectangle', insets: [0, 0, 0, 0]},
    {shape: 'rounded-rectangle', adjustments: {radius: 0}, insets: [0, 0, 0, 0]},
    {shape: 'rounded-rectangle', insets: [7.02936, 10.54404, 7.02936, 10.54404]},
    {shape: 'rounded-rectangle', adjustments: {radius: 300}, insets: [17.5734, 26.3601, 17.5734, 26.3601]},
    {shape: 'triangle', adjustments: {apexX: 240}, insets: [100, 114, 0, 36]},
    {shape: 'right-arrow', adjustments: {headLength: 400, shaftThickness: 600}, insets: [40, 72, 40, 0]},
    {shape: 'wedge-rect-callout', adjustments: {tailX: 500, tailY: 0}, insets: [48, 0, 0, 0]},
    {shape: 'wedge-round-callout', adjustments: {tailX: 1000, tailY: 500}, insets: [7.02936, 82.54404, 7.02936, 10.54404]},
  ]

  for (const item of cases) {
    it(`projects ${item.shape} ${JSON.stringify(item.adjustments ?? {})} consistently across live, snapshot and inline views`, () => {
      const styles = TestBed.createComponent(TextFrameGeometryStyles)
      styles.detectChanges()
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-blockcraft-root', 'true')
      document.body.append(wrapper)
      const margins: [number, number, number, number] = [3, 7, 11, 17]
      try {
        for (const userMargins of [[0, 0, 0, 0] as typeof margins, margins]) {
          const props = {
            shape: item.shape, adjustments: item.adjustments,
            width: 300, height: 200,
            ...storeObjectTextFrame({...DEFAULT_OBJECT_TEXT_FRAME, margins: userMargins}),
          }
          const textBox = TextBoxBlockSchema.createSnapshot('文字', props)
          const shape = ShapeBlockSchema.createSnapshot(item.shape, '文字')
          shape.props = {...shape.props, ...props}
          const expected = item.insets.map((value, index) => value + userMargins[index]!)
          for (const snapshot of [textBox, shape]) {
            const isTextBox = snapshot.flavour === 'text-box'
            const fixture = TestBed.createComponent(isTextBox ? TextBoxBlockComponent : ShapeBlockComponent as any)
            const host = fixture.nativeElement as HTMLElement
            host.classList.add(isTextBox ? 'text-box-block' : 'shape-block')
            wrapper.append(host)
            const yDoc = new Y.Doc()
            const yBlock = new Y.Map<unknown>()
            for (const key of ['id', 'flavour', 'nodeType'] as const) yBlock.set(key, snapshot[key])
            yBlock.set('props', new Y.Map(Object.entries(snapshot.props)))
            yBlock.set('meta', new Y.Map())
            yBlock.set('children', new Y.Array())
            yDoc.getMap('blocks').set(snapshot.id, yBlock)
            fixture.componentRef.setInput('model', snapshot)
            fixture.componentRef.setInput('yBlock', yBlock)
            fixture.componentRef.setInput('doc', {
              isReadonly: true,
              schemas: {get: () => isTextBox ? TextBoxBlockSchema : ShapeBlockSchema},
              placement: {isInAbsoluteLayout: () => false, registerBlockView: () => null},
              readonlyManager: {isReadonly: () => true, resolve: () => ({readonly: true, source: {kind: 'document'}})},
            })
            fixture.detectChanges()
            const surfaceSelector = isTextBox ? '.text-box-block__surface' : '.shape-block__shell'
            const contentSelector = isTextBox ? '.text-box-block__content' : '.shape-block__text-frame'
            try {
              expectInsets(host, surfaceSelector, contentSelector, expected, 'live')
              const viewer = document.createElement('div')
              viewer.className = 'bc-snapshot-viewer'
              wrapper.append(viewer)
              const renderer = createSnapshotRenderer()
              try {
                renderer.render(viewer, {id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [snapshot]} as IBlockSnapshot)
                expectInsets(viewer, surfaceSelector, contentSelector, expected, 'snapshot')
              } finally { renderer.destroy(); viewer.remove() }
            } finally { fixture.destroy(); yDoc.destroy() }
          }
          const inline = inlineShapeEmbedConverter.toView(createInlineShapeDelta(props, [{insert: '文字'}]))
          wrapper.append(inline)
          expectInsets(inline, '.bc-inline-shape-frame', '.bc-inline-shape__text', expected, 'inline')
          inline.remove()
        }
      } finally { wrapper.remove(); styles.destroy() }
    })
  }

  it('updates rounded bounds after a radius change and resize while keeping margins in pixels', () => {
    const styles = TestBed.createComponent(TextFrameGeometryStyles)
    styles.detectChanges()
    const viewer = document.createElement('div')
    viewer.className = 'bc-snapshot-viewer'
    document.body.append(viewer)
    const renderer = createSnapshotRenderer()
    try {
      const snapshot = TextBoxBlockSchema.createSnapshot('文字', {
        shape: 'rounded-rectangle', width: 300, height: 200,
        adjustments: {radius: 0},
        ...storeObjectTextFrame({...DEFAULT_OBJECT_TEXT_FRAME, margins: [3, 7, 11, 17]}),
      })
      const root = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [snapshot]} as IBlockSnapshot
      renderer.render(viewer, root)
      expectInsets(viewer, '.text-box-block__surface', '.text-box-block__content', [3, 7, 11, 17], 'initial')
      const updated = {...snapshot, props: {...snapshot.props, width: 180, height: 320, adjustments: {radius: 300}}}
      renderer.update({...root, children: [updated]} as IBlockSnapshot)
      expectInsets(viewer, '.text-box-block__surface', '.text-box-block__content', [31.11744, 22.81606, 39.11744, 32.81606], 'updated')
    } finally { renderer.destroy(); viewer.remove(); styles.destroy() }
  })

  it('keeps decoration margins editable without introducing a geometry reserve', () => {
    const preset = getTextBoxPreset('office-banded')
    const styles = TestBed.createComponent(TextFrameGeometryStyles)
    styles.detectChanges()
    const viewer = document.createElement('div')
    viewer.className = 'bc-snapshot-viewer'
    document.body.append(viewer)
    const renderer = createSnapshotRenderer()
    try {
      const snapshot = TextBoxBlockSchema.createSnapshot('文字', {
        ...preset.props, width: 300, height: 200,
        ...storeObjectTextFrame({...DEFAULT_OBJECT_TEXT_FRAME, margins: [0, 0, 0, 0], direction: 'vertical-rl'}),
      })
      renderer.render(viewer, {id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [snapshot]} as IBlockSnapshot)
      expectInsets(viewer, '.text-box-block__surface', '.text-box-block__content', [0, 0, 0, 0], 'decorated vertical')
    } finally { renderer.destroy(); viewer.remove(); styles.destroy() }
  })
})

function expectInsets(host: HTMLElement, surfaceSelector: string, contentSelector: string, expected: number[], context: string): void {
  const surface = host.querySelector<HTMLElement>(surfaceSelector)!
  const content = host.querySelector<HTMLElement>(contentSelector)!
  expect(getComputedStyle(content).position).withContext(context).toBe('absolute')
  const outer = surface.getBoundingClientRect(), inner = content.getBoundingClientRect()
  const actual = [inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom, inner.left - outer.left]
  expected.forEach((value, index) => expect(actual[index]).withContext(`${context} side ${index}`).toBeCloseTo(value, 1))
  expect(inner.width).withContext(context).toBeGreaterThan(0)
  expect(inner.height).withContext(context).toBeGreaterThan(0)
}
