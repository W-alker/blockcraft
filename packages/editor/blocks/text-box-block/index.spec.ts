import {Component} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import * as Y from 'yjs'
import {
  BlockNodeType,
  normalizeBlockObjectFormat,
  normalizeObjectPaint,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  type IBlockSnapshot,
  type YBlock,
} from '../../framework'
import {
  DEFAULT_TEXT_BOX_PROPS,
  getTextBoxArtwork,
  getTextBoxPreset,
  TextBoxBlockComponent,
  TextBoxBlockSchema,
  TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
  normalizeTextBoxProps,
  type TextBoxBlockProps,
} from './index'
import {ShapeResizerComponent} from '../shape-block'

@Component({
  selector: 'text-box-focus-style-harness',
  standalone: true,
  imports: [ShapeResizerComponent],
  template: `
    <div data-blockcraft-root="true">
      <div class="text-box-block selected">
        <div
          #surface
          class="text-box-block__surface"
          style="width: 160px; height: 64px">
          <div class="text-box-block__content" contenteditable="true">
            <p style="flex: none; height: 240px; margin: 0">裁剪内容</p>
          </div>
          <button class="text-box-block__object-handle"></button>
          <shape-resizer [target]="surface"></shape-resizer>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/blocks/text-box-block.scss',
})
class TextBoxFocusStyleHarness {}

/**
 * A frame whose text can never fit, so the reserve is under real pressure.
 * The vars are the ones the Block and the Snapshot Viewer both emit; the
 * numbers are a bubble-sized reserve (a tail hangs below the balloon, so the
 * bottom is the biggest side).
 */
@Component({
  selector: 'text-box-reserve-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div
        class="text-box-block"
        style="
          --bc-text-box-padding-top: 20px;
          --bc-text-box-padding-right: 30px;
          --bc-text-box-padding-bottom: 60px;
          --bc-text-box-padding-left: 40px;
        ">
        <div class="text-box-block__surface" style="width: 300px; height: 200px">
          <div class="text-box-block__content" contenteditable="true">
            <p style="flex: none; height: 400px; margin: 0">超长内容</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/blocks/text-box-block.scss',
})
class TextBoxReserveHarness {}

/**
 * Two frames, same two paragraphs, same spacing props — one horizontal, one
 * vertical. `sb` / `sa` are what 段落设置 writes; `leading-sb` is the
 * first-sibling projection used by the one-gap layout model.
 */
@Component({
  selector: 'text-box-spacing-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div class="text-box-block">
        <div class="text-box-block__surface" style="width: 300px; height: 200px">
          <div class="text-box-block__content">
            <p
              id="h-first"
              data-block-id
              data-node-type="editable"
              style="--bc-block-sb: 12px; --bc-block-leading-sb: 12px; --bc-block-sa: 40px">一</p>
            <p data-block-id data-node-type="editable">二</p>
          </div>
        </div>
      </div>
      <p
        id="outside"
        data-block-id
        data-node-type="editable"
        style="--bc-block-sb: 12px; --bc-block-leading-sb: 12px; --bc-block-sa: 40px">框外</p>
      <div class="text-box-block" style="--bc-text-box-writing-mode: vertical-rl">
        <div class="text-box-block__surface" style="width: 200px; height: 300px">
          <div class="text-box-block__content">
            <p
              id="v-first"
              data-block-id
              data-node-type="editable"
              style="--bc-block-sb: 12px; --bc-block-leading-sb: 12px; --bc-block-sa: 40px">一</p>
            <p data-block-id data-node-type="editable">二</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
  styleUrls: [
    '../../themes/base.scss',
    '../../themes/blocks/text-box-block.scss',
  ],
})
class TextBoxSpacingHarness {}

@Component({
  selector: 'text-box-vertical-list-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div
        class="text-box-block"
        data-bc-text-box-wm="v"
        style="--bc-text-box-writing-mode: vertical-rl">
        <div class="text-box-block__surface" style="width: 240px; height: 300px">
          <div class="text-box-block__content">
            <div id="vertical-ordered" class="ordered-block" data-block-id>
              <button class="ordered-block-prefix" contenteditable="false">
                <span class="ordered-block-prefix__text">1.</span>
              </button>
              <div class="edit-container" style="inline-size: 72px">
                有序文本需要换成多列才能验证首列对齐
              </div>
            </div>
            <div id="vertical-todo" class="todo-block" data-block-id>
              <button class="todo-block-button" contenteditable="false">□</button>
              <div class="edit-container" style="inline-size: 72px">
                待办文本需要换成多列才能验证首列对齐
              </div>
            </div>
            <div id="vertical-bullet" class="bullet-block" data-block-id>
              <span class="bullet-block-prefix" contenteditable="false">
                <span class="point"></span>
              </span>
              <div class="edit-container" style="inline-size: 72px">
                项目文本需要换成多列才能验证首列对齐
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
  styleUrls: [
    '../../themes/base.scss',
    '../../themes/blocks/text-box-block.scss',
  ],
})
class TextBoxVerticalListHarness {}

@Component({
  selector: 'text-box-placeholder-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div class="text-box-block" data-bc-text-box-wm="h">
        <div class="text-box-block__surface" style="width: 180px; height: 100px">
          <div class="text-box-block__content">
            <p
              id="horizontal-placeholder"
              class="paragraph-block edit-container bc-placeholder-empty bc-placeholder-target"
              data-block-id
              data-node-type="editable"
              data-placeholder="输入文字"></p>
          </div>
        </div>
      </div>
      <div
        class="text-box-block"
        data-bc-text-box-wm="v"
        style="--bc-text-box-writing-mode: vertical-rl">
        <div class="text-box-block__surface" style="width: 180px; height: 100px">
          <div class="text-box-block__content">
            <p
              id="vertical-placeholder"
              class="paragraph-block edit-container bc-placeholder-empty bc-placeholder-target"
              data-block-id
              data-node-type="editable"
              data-placeholder="输入文字"></p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      #horizontal-placeholder,
      #vertical-placeholder {
        width: 140px;
        height: 60px;
        margin: 0;
        pointer-events: none;
      }

      #horizontal-placeholder::before,
      #vertical-placeholder::before {
        content: '';
        inline-size: 12px;
        block-size: 12px;
        pointer-events: auto;
      }
    `,
  ],
  styleUrls: [
    '../../themes/base.scss',
    '../../themes/blocks/text-box-block.scss',
  ],
})
class TextBoxPlaceholderHarness {}

/**
 * One decorated preset at its design size and at a frame stretched well away
 * from it. The insets come from the artwork registry as percentages, which is
 * the whole point of the exercise.
 */
@Component({
  selector: 'text-box-artwork-frame-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div
        class="text-box-block"
        [style]="insetStyle">
        <div
          id="design-size"
          class="text-box-block__surface"
          style="width: 360px; height: 240px">
          <div class="text-box-block__content"></div>
        </div>
      </div>
      <div
        class="text-box-block"
        [style]="insetStyle">
        <div
          id="stretched"
          class="text-box-block__surface"
          style="width: 540px; height: 160px">
          <div class="text-box-block__content"></div>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/blocks/text-box-block.scss',
})
class TextBoxArtworkFrameHarness {
  private readonly insets = getTextBoxArtwork(
    getTextBoxPreset('bubble-r-blob-halo').props.artwork,
  )!.textInsets

  protected readonly insetStyle =
    `--bc-text-box-shape-inset-top: ${this.insets.top * 100}%;` +
    `--bc-text-box-shape-inset-right: ${this.insets.right * 100}%;` +
    `--bc-text-box-shape-inset-bottom: ${this.insets.bottom * 100}%;` +
    `--bc-text-box-shape-inset-left: ${this.insets.left * 100}%;` +
    '--bc-text-box-padding-top: 0px; --bc-text-box-padding-right: 0px;' +
    '--bc-text-box-padding-bottom: 0px; --bc-text-box-padding-left: 0px;'
}

describe('TextBoxBlockSchema', () => {
  it('clips focused overflow without making the content area scrollable', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxFocusStyleHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxFocusStyleHarness)
    fixture.detectChanges()
    const content = fixture.nativeElement.querySelector(
      '.text-box-block__content',
    ) as HTMLElement
    const surface = fixture.nativeElement.querySelector(
      '.text-box-block__surface',
    ) as HTMLElement
    const resizer = fixture.nativeElement.querySelector(
      'shape-resizer',
    ) as HTMLElement
    const objectHandle = fixture.nativeElement.querySelector(
      '.text-box-block__object-handle',
    ) as HTMLElement

    try {
      content.focus()
      const style = getComputedStyle(content)

      expect(document.activeElement).toBe(content)
      expect(style.outlineStyle).toBe('none')
      expect(style.boxShadow).toBe('none')
      expect(style.display).toBe('flex')
      expect(style.overflowX).toBe('hidden')
      expect(style.overflowY).toBe('hidden')
      expect(content.scrollHeight).toBeGreaterThan(content.clientHeight)
      expect(getComputedStyle(resizer).display).toBe('block')
      expect(getComputedStyle(objectHandle).display).toBe('none')

      // Text editing shows no frame chrome: without whole-object selection
      // the resizer must fall back to its hidden default while the compact
      // object handle becomes available without drawing a frame outline.
      resizer.closest('.text-box-block')!.classList.remove('selected')
      expect(getComputedStyle(resizer).display).toBe('none')
      expect(getComputedStyle(objectHandle).display).toBe('flex')
      expect(getComputedStyle(objectHandle).pointerEvents).toBe('auto')
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('reserves the frame edges as geometry, so overflowing text cannot reach them', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxReserveHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxReserveHarness)
    fixture.detectChanges()
    const surface = fixture.nativeElement.querySelector(
      '.text-box-block__surface',
    ) as HTMLElement
    const content = fixture.nativeElement.querySelector(
      '.text-box-block__content',
    ) as HTMLElement

    try {
      // Padding would only offset the two start edges. The end edges are
      // trailing space in the flow and `overflow` clips at the padding box, so
      // text taller than the frame paints straight through the bottom reserve —
      // over a bubble's rim and down its tail. The reserve has to shrink the box.
      expect(getComputedStyle(content).padding).toBe('0px')
      expect(content.offsetWidth).toBe(300 - 40 - 30)
      expect(content.offsetHeight).toBe(200 - 20 - 60)

      const frame = surface.getBoundingClientRect()
      const box = content.getBoundingClientRect()
      expect(box.top - frame.top).toBeCloseTo(20, 0)
      expect(frame.bottom - box.bottom).toBeCloseTo(60, 0)

      // Overflow is clipped at the usable content box, before the bubble tail.
      expect(getComputedStyle(content).overflow).toBe('hidden')
      expect(content.getBoundingClientRect().bottom)
        .toBeCloseTo(frame.bottom - 60, 0)
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('aligns vertical list markers with the first wrapped text column', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxVerticalListHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxVerticalListHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    try {
      const cases = [
        ['vertical-ordered', '.ordered-block-prefix'],
        ['vertical-todo', '.todo-block-button'],
        ['vertical-bullet', '.bullet-block-prefix'],
      ] as const

      for (const [id, prefixSelector] of cases) {
        const block = host.querySelector<HTMLElement>(`#${id}`)!
        const prefix = block.querySelector<HTMLElement>(prefixSelector)!
        const text = block.querySelector<HTMLElement>('.edit-container')!
        const markerRect = prefix.getBoundingClientRect()
        const textRect = text.getBoundingClientRect()
        const prefixStyle = getComputedStyle(prefix)

        expect(getComputedStyle(block).alignItems).toBe('flex-start')
        expect(prefixStyle.marginRight).toBe('0px')
        expect(parseFloat(prefixStyle.marginInlineEnd)).toBeGreaterThan(0)
        expect(textRect.width).toBeGreaterThan(markerRect.width)
        expect(markerRect.right).toBeCloseTo(textRect.right, 0)
        expect(textRect.top).toBeGreaterThan(markerRect.bottom)
      }
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('places an empty paragraph placeholder at its logical writing start', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPlaceholderHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPlaceholderHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    try {
      const horizontal = host.querySelector<HTMLElement>(
        '#horizontal-placeholder',
      )!
      const vertical = host.querySelector<HTMLElement>(
        '#vertical-placeholder',
      )!
      const horizontalRect = horizontal.getBoundingClientRect()
      const verticalRect = vertical.getBoundingClientRect()
      const hitsPlaceholderAt = (element: HTMLElement, x: number, y: number) =>
        document.elementFromPoint(x, y) === element

      expect(getComputedStyle(horizontal).writingMode).toBe('horizontal-tb')
      expect(
        hitsPlaceholderAt(
          horizontal,
          horizontalRect.left + 6,
          horizontalRect.top + 6,
        ),
      ).toBeTrue()
      expect(
        hitsPlaceholderAt(
          horizontal,
          horizontalRect.right - 6,
          horizontalRect.top + 6,
        ),
      ).toBeFalse()

      expect(getComputedStyle(vertical).writingMode).toBe('vertical-rl')
      expect(
        hitsPlaceholderAt(
          vertical,
          verticalRect.right - 6,
          verticalRect.top + 6,
        ),
      ).toBeTrue()
      expect(
        hitsPlaceholderAt(
          vertical,
          verticalRect.left + 6,
          verticalRect.top + 6,
        ),
      ).toBeFalse()
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('keeps 段落设置 spacing working inside a frame, on the frame\'s own axis', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxSpacingHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxSpacingHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    try {
      // Horizontal: the leading before-space stays on the first paragraph,
      // while after-space owns the following sibling boundary.
      const h = getComputedStyle(host.querySelector('#h-first')!)
      expect(h.paddingTop).toBe('12px')
      expect(h.marginBottom).toBe('40px')

      // The same first-sibling projection outside a frame uses the same axis.
      const out = getComputedStyle(host.querySelector('#outside')!)
      expect(out.paddingTop).toBe(h.paddingTop)
      expect(out.marginBottom).toBe(h.marginBottom)

      // Vertical (`vertical-rl`): the block axis runs right-to-left, so the
      // same two values have to land on the right and left edges. Left as
      // physical margins they would push the text sideways and let the
      // segments touch.
      const v = getComputedStyle(host.querySelector('#v-first')!)
      expect(v.paddingRight).toBe('12px')
      expect(v.marginLeft).toBe('40px')
      expect(v.marginTop).toBe('0px')
      expect(v.marginBottom).toBe('0px')
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('scales a decorated frame\'s text area with the frame itself', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxArtworkFrameHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxArtworkFrameHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    try {
      const measure = (id: string) => {
        const surface = host.querySelector(`#${id}`) as HTMLElement
        const content = surface.querySelector(
          '.text-box-block__content',
        ) as HTMLElement
        const s = surface.getBoundingClientRect()
        const c = content.getBoundingClientRect()
        return {
          width: c.width / s.width,
          height: c.height / s.height,
          left: (c.left - s.left) / s.width,
        }
      }

      // Same artwork, two very different frames. The drawing is stretched to
      // the frame (`preserveAspectRatio="none"` plus `bgs: 'stretch'`), so its
      // text-safe area has to stretch with it. As fixed px it did not: a frame
      // dragged from 360x240 to 540x160 kept a 360px-wide text rectangle inside
      // a balloon whose interior had become 270px wide.
      const design = measure('design-size')
      const stretched = measure('stretched')

      expect(stretched.width).toBeCloseTo(design.width, 3)
      expect(stretched.height).toBeCloseTo(design.height, 3)
      expect(stretched.left).toBeCloseTo(design.left, 3)
    } finally {
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('creates a fixed-size text box with one editable paragraph', () => {
    const snapshot = TextBoxBlockSchema.createSnapshot()

    expect(snapshot.flavour).toBe('text-box')
    expect(snapshot.nodeType).toBe(BlockNodeType.block)
    expect(snapshot.props).toEqual(DEFAULT_TEXT_BOX_PROPS)
    expect(snapshot.children.length).toBe(1)
    const paragraph = snapshot.children[0] as IBlockSnapshot
    expect(paragraph.flavour).toBe('paragraph')
    expect(paragraph.children).toEqual([])
  })

  it('keeps initial rich text in the seeded paragraph', () => {
    const snapshot = TextBoxBlockSchema.createSnapshot([
      {insert: 'Hello'},
      {insert: ' world', attributes: {bold: true}},
    ])

    const paragraph = snapshot.children[0] as IBlockSnapshot
    expect(paragraph.children).toEqual([
      {insert: 'Hello'},
      {insert: ' world', attributes: {bold: true}},
    ])
  })

  it('restores an editable child surface inside non-editable object chrome', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxBlockComponent],
    }).compileComponents()

    let readonly = false
    const snapshot = TextBoxBlockSchema.createSnapshot()
    const yDoc = new Y.Doc()
    const yBlock = new Y.Map<unknown>() as YBlock
    const yProps = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(snapshot.props)) {
      yProps.set(key, value)
    }
    yBlock.set('id', snapshot.id)
    yBlock.set('flavour', snapshot.flavour)
    yBlock.set('nodeType', snapshot.nodeType)
    yBlock.set('props', yProps)
    yBlock.set('meta', new Y.Map<unknown>())
    yBlock.set('children', new Y.Array<string>())
    yDoc.getMap('blocks').set(snapshot.id, yBlock)
    const setCursorAtBlock = jasmine.createSpy('setCursorAtBlock')
    const doc = {
      isReadonly: false,
      schemas: {get: () => TextBoxBlockSchema},
      selection: {setCursorAtBlock},
      placement: {
        allowsGapCursor: () => false,
        isInAbsoluteLayout: () => true,
        registerBlockView: () => null,
      },
      readonlyManager: {
        isReadonly: () => readonly,
        resolve: () => ({
          readonly,
          source: readonly ? {kind: 'document'} : null,
        }),
      },
    } as unknown as BlockCraft.Doc

    const fixture = TestBed.createComponent(TextBoxBlockComponent)
    fixture.componentRef.setInput('model', snapshot)
    fixture.componentRef.setInput('yBlock', yBlock)
    fixture.componentRef.setInput('doc', doc)
    fixture.detectChanges()

    try {
      const surface = fixture.nativeElement.querySelector(
        '.text-box-block__surface',
      ) as HTMLElement
      const content = fixture.nativeElement.querySelector(
        '.text-box-block__content',
      ) as HTMLElement

      expect(surface.getAttribute('contenteditable')).toBe('false')
      expect(surface.getAttribute('data-bc-resize-preview-anchor'))
        .toBeNull()
      expect(content.getAttribute('contenteditable')).toBe('true')
      expect(
        fixture.nativeElement.querySelectorAll('[data-bc-print-visual-surface]')
          .length,
      ).toBe(1)
      expect(
        fixture.nativeElement
          .querySelector('shape-resizer')
          ?.getAttribute('data-bc-print-exclude'),
      ).toBe('true')
      const objectHandle = fixture.nativeElement.querySelector(
        '.text-box-block__object-handle',
      ) as HTMLButtonElement | null
      expect(objectHandle).not.toBeNull()
      expect(objectHandle?.getAttribute('aria-label'))
        .toBe('选中文本框并拖动')
      expect(objectHandle?.hasAttribute(
        'data-bc-selection-interaction-ignore',
      )).toBeTrue()
      expect(objectHandle?.hasAttribute('data-bc-placement-pick-ignore'))
        .toBeTrue()
      const frameHitTarget = fixture.nativeElement.querySelector(
        '.text-box-block__frame-hit-target',
      ) as SVGPathElement | null
      expect(frameHitTarget).not.toBeNull()
      expect(frameHitTarget?.hasAttribute(
        'data-bc-selection-interaction-frame',
      )).toBeTrue()
      expect(frameHitTarget?.getAttribute('stroke')).toBe('transparent')

      fixture.componentInstance.enterEditing(true)
      expect(setCursorAtBlock).toHaveBeenCalledOnceWith(
        fixture.componentInstance,
        true,
        true,
      )

      readonly = true
      fixture.componentInstance.applyReadonlyViewState()
      fixture.detectChanges()
      expect(content.getAttribute('contenteditable')).toBe('false')
      expect(fixture.nativeElement.querySelector('shape-resizer')).toBeNull()
      expect(fixture.nativeElement.querySelector(
        '.text-box-block__object-handle',
      )).toBeNull()
    } finally {
      fixture.destroy()
      yDoc.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('normalizes geometry, surface and absolute placement props', () => {
    const defaults = normalizeBlockObjectFormat(
      {},
      TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
    )
    const props = normalizeTextBoxProps({
      width: -10,
      height: 4_000,
      rotation: -15,
      fill: storeObjectPaint({
        type: 'picture',
        opacity: 1,
        src: '/assets/paper.png',
        fit: 'contain',
        positionX: 50,
        positionY: 50,
      }),
      outline: storeObjectLine({
        ...defaults.shapeOutline!,
        color: '#334155',
      }),
      textFrame: storeObjectTextFrame({
        ...defaults.textFrame!,
        margins: [8, 16, 8, 16],
      }),
      position: {
        x: 32,
        y: 48,
      },
      placementLayer: 'under',
    })

    expect(props).toEqual(jasmine.objectContaining({
      p: [8, 16, 8, 16],
      bgi: '/assets/paper.png',
      bgs: 'contain',
      width: 48,
      height: 2_000,
      rotation: 345,
      backColor: 'transparent',
      borderColor: '#334155',
      shapeType: 'rectangle',
      fo: 1,
      bw: 1,
      bs: 'solid',
      wm: 'h',
      position: {
        x: 32,
        y: 48,
      },
      placementLayer: 'under',
    }))
  })

  it('defaults the writing mode to horizontal and ignores its removed flat alias', () => {
    expect(normalizeTextBoxProps({}).wm).toBe('h')
    expect(normalizeTextBoxProps({wm: 'v'}).wm).toBe('h')
    expect(normalizeTextBoxProps({wm: 'vertical-rl'} as never).wm).toBe('h')
    expect(normalizeTextBoxProps({wm: null} as never).wm).toBe('h')
  })

  it('creates a plain frame with the default black outline', () => {
    const snapshot = TextBoxBlockSchema.createSnapshot('', {wm: 'v'})
    const props = normalizeTextBoxProps(
      snapshot.props as Partial<TextBoxBlockProps>,
    )

    expect(props.wm).toBe('h')
    expect(props.borderColor).toBe('#000000')
    expect(props.shapeType).toBe('rectangle')
  })

  it('ignores removed shape-shell and WordArt aliases', () => {
    const props = normalizeTextBoxProps({
      sh: 'line',
      fo: 2,
      bw: -4,
      bs: 'dashed',
      wa: '{"effect":"wide"}',
    })

    expect(props.shapeType).toBe('rectangle')
    expect(props.fo).toBe(1)
    expect(props.bw).toBe(1)
    expect(props.bs).toBe('solid')
    expect('wa' in props).toBeFalse()
  })

  it('falls back instead of coercing missing dimensions to minimums', () => {
    expect(TextBoxBlockSchema.createSnapshot('', {
      width: null as unknown as number,
      height: Number.NaN,
      rotation: Number.POSITIVE_INFINITY,
    }).props).toEqual(DEFAULT_TEXT_BOX_PROPS)
  })

  it('owns a closed rich-text child contract and fixed model height', () => {
    expect(TextBoxBlockSchema.metadata.includeChildren).toEqual([
      'paragraph',
      'bullet',
      'ordered',
      'todo',
      'blockquote',
    ])
    expect(TextBoxBlockSchema.metadata.renderUnit).toBeTrue()
    expect(TextBoxBlockSchema.metadata.selectionScope).toEqual({
      relative: 'transparent',
      absolute: 'container',
    })
    expect(TextBoxBlockSchema.metadata.selectionInteraction).toEqual({
      frame: 'selectable',
      escapeToFrame: 'always',
      editingBoundary: 'absolute',
    })
    expect(TextBoxBlockSchema.metadata.placement?.modes).toEqual([
      'relative',
      'absolute',
    ])
    expect(TextBoxBlockSchema.metadata.objectSizing).toBeUndefined()

    const estimateHeight = TextBoxBlockSchema.metadata.virtualization
      ?.estimateHeight
    expect(estimateHeight).toBeDefined()
    expect(estimateHeight!({
      blockId: 'text-box-1',
      flavour: 'text-box',
      nodeType: BlockNodeType.block,
      props: {...DEFAULT_TEXT_BOX_PROPS, height: 360},
      childIds: ['paragraph-1'],
      layoutMode: 'paginated',
      fallbackHeight: 48,
      rootContentWidth: 680,
      baseFontSize: 16,
      lineHeight: 24,
      estimateChildHeight: () => 2_000,
    })).toBe(360)
  })
})
