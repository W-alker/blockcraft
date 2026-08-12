import {Component, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import * as Y from 'yjs'
import {BlockNodeType} from '../../framework'
import {ShapeResizerComponent} from '../shape-block'
import {
  WORD_ART_FONT_OPTIONS,
  WORD_ART_PRESETS,
  WordArtBlockComponent,
  WordArtBlockSchema,
  calculateWordArtResize,
  getWordArtPreset,
  normalizeWordArtProps,
  resolveWordArtPresentation,
  wordArtPresentationToInlineStyle,
} from './index'

@Component({
  selector: 'word-art-transform-visibility-harness',
  standalone: true,
  imports: [ShapeResizerComponent],
  template: `
    <div data-blockcraft-root="true">
      <div class="word-art-block" [class.focused]="focused">
        <div #surface class="word-art-block__surface">
          <shape-resizer [target]="surface"></shape-resizer>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/blocks/word-art-block.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class WordArtTransformVisibilityHarness {
  focused = true
}

@Component({
  selector: 'word-art-css-inheritance-harness',
  standalone: true,
  template: `
    <div
      class="word-art-block__editor"
      data-bc-word-art-print-props="{}"
      style="color: transparent; -webkit-text-fill-color: transparent; font: 900 48px/1.1 sans-serif"
    >
      <c-element style="color: black; -webkit-text-fill-color: black; font: 16px serif">
        <c-text>艺术字</c-text>
      </c-element>
    </div>
  `,
  styleUrl: '../../themes/blocks/word-art-block.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class WordArtCssInheritanceHarness {}

describe('Word art block domain', () => {
  it('shows transform controls for the editable focused state', async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtTransformVisibilityHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(WordArtTransformVisibilityHarness)
    fixture.detectChanges()
    const resizer = fixture.nativeElement.querySelector(
      'shape-resizer',
    ) as HTMLElement

    expect(getComputedStyle(resizer).display).toBe('block')

    fixture.componentInstance.focused = false
    fixture.detectChanges()
    expect(getComputedStyle(resizer).display).toBe('none')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('keeps legacy inline glyph styles from turning selection or drag clones black', async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtCssInheritanceHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(WordArtCssInheritanceHarness)
    fixture.detectChanges()
    const editor = fixture.nativeElement.querySelector(
      '.word-art-block__editor',
    ) as HTMLElement
    const clone = editor.cloneNode(true) as HTMLElement
    document.body.appendChild(clone)

    try {
      for (const host of [editor, clone]) {
        const inline = host.querySelector('c-element') as HTMLElement
        const computed = getComputedStyle(inline)
        expect(computed.color).toBe('rgba(0, 0, 0, 0)')
        expect(computed.webkitTextFillColor).toBe('rgba(0, 0, 0, 0)')
        expect(computed.fontSize).toBe('48px')
        expect(computed.fontWeight).toBe('900')
      }
    } finally {
      clone.remove()
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('restores a real caret host inside a non-editable placement shell', async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtBlockComponent],
    }).compileComponents()

    let readonly = false
    const snapshot = WordArtBlockSchema.createSnapshot()
    const yDoc = new Y.Doc()
    const yBlock = new Y.Map<unknown>()
    yDoc.getMap('blocks').set(snapshot.id, yBlock)
    const yProps = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(snapshot.props)) {
      yProps.set(key, value)
    }
    const yMeta = new Y.Map<unknown>()
    const yText = new Y.Text()
    yText.applyDelta(snapshot.children)
    yBlock.set('props', yProps)
    yBlock.set('meta', yMeta)
    yBlock.set('children', yText)
    const doc = {
      isReadonly: false,
      config: {embeds: []},
      schemas: {get: () => WordArtBlockSchema},
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

    const fixture = TestBed.createComponent(WordArtBlockComponent)
    fixture.componentRef.setInput('model', snapshot)
    fixture.componentRef.setInput('yBlock', yBlock)
    fixture.componentRef.setInput('doc', doc)
    const placementShell = document.createElement('div')
    placementShell.contentEditable = 'false'
    document.body.appendChild(placementShell)
    placementShell.appendChild(fixture.nativeElement)

    try {
      fixture.detectChanges()
      const editor = fixture.nativeElement.querySelector(
        '.word-art-block__editor',
      ) as HTMLElement

      expect(placementShell.isContentEditable).toBeFalse()
      expect(fixture.nativeElement.querySelector('svg')).toBeNull()
      expect(editor.style.color).toBe('transparent')
      expect(editor.style.webkitTextFillColor).toBe('transparent')
      expect(editor.style.backgroundImage).toContain('linear-gradient(')
      expect(editor.style.backgroundClip).toBe('text')
      expect(editor.style.getPropertyValue('-webkit-background-clip'))
        .toBe('text')
      expect(editor.style.getPropertyValue('-webkit-text-stroke'))
        .toContain('0.03em')
      expect(editor.style.textShadow).toContain('rgba(124, 45, 18, 0.3)')
      expect(editor.style.transform).toBe('')
      expect(editor.getAttribute('contenteditable')).toBe('true')
      expect(editor.isContentEditable).toBeTrue()
      expect(
        fixture.nativeElement.querySelectorAll('.shape-resizer__move-edge')
          .length,
      ).toBe(4)

      editor.focus()
      const text = document
        .createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        .nextNode()
      expect(text).not.toBeNull()
      const range = document.createRange()
      range.setStart(text!, Math.min(1, text!.textContent?.length ?? 0))
      range.collapse(true)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(document.activeElement).toBe(editor)
      expect(editor.contains(selection.anchorNode)).toBeTrue()

      const overflowProbe = document.createElement('div')
      overflowProbe.style.height = '1000px'
      editor.style.height = '1px'
      editor.style.overflow = 'auto'
      editor.appendChild(overflowProbe)
      editor.scrollTop = 40
      expect(editor.scrollTop).toBeGreaterThan(0)

      editor.dispatchEvent(new Event('scroll'))

      expect(editor.scrollTop).toBe(0)
      overflowProbe.remove()
      editor.style.removeProperty('height')
      editor.style.removeProperty('overflow')

      readonly = true
      fixture.componentInstance.applyReadonlyViewState()
      fixture.detectChanges()
      expect(editor.getAttribute('contenteditable')).toBe('false')
      expect(editor.isContentEditable).toBeFalse()
      expect(
        fixture.nativeElement.querySelector('.shape-resizer__move-edge'),
      ).toBeNull()
    } finally {
      document.getSelection()?.removeAllRanges()
      fixture.destroy()
      placementShell.remove()
      TestBed.resetTestingModule()
    }
  })

  it('is an editable block backed directly by inline text', () => {
    const snapshot = WordArtBlockSchema.createSnapshot()

    expect(snapshot.flavour).toBe('word-art')
    expect(snapshot.nodeType).toBe(BlockNodeType.editable)
    expect(snapshot.children).toEqual([{insert: '艺术字'}])
    expect(
      snapshot.children.some(
        (child) => typeof child === 'object' && 'flavour' in child,
      ),
    ).toBeFalse()
    expect(WordArtBlockSchema.metadata.plainTextOnly).toBeTrue()
  })

  it('strips rich inline attributes and embeds at creation time', () => {
    const snapshot = WordArtBlockSchema.createSnapshot([
      {insert: '安全', attributes: {'a:bold': true}},
      {insert: {mention: '成员'}},
      {insert: {break: '\n'}},
      {insert: '文字'},
    ])

    expect(snapshot.children).toEqual([
      {insert: '安全'},
      {insert: {break: '\n'}},
      {insert: '文字'},
    ])
  })

  it('normalizes malformed external values into bounded safe props', () => {
    const input: any = {
      width: -20,
      height: Number.NaN,
      rotation: -15,
      fontFamily: 'url(javascript:bad)',
      fontSize: 9999,
      fillColor: '#abc',
      gradientColors: ['red', '#0af', '#123456', '#fff', '#000'],
      gradientStops: [2, -1, 0.5, 0.8],
      outlineColor: 'currentColor',
      shadowOpacity: 5,
      effect: 'rotate(999deg)',
    }
    const normalized = normalizeWordArtProps(input)

    expect(normalized.width).toBe(48)
    expect(normalized.height).toBe(96)
    expect(normalized.rotation).toBe(345)
    expect(normalized.fontFamily).toBe('display-sans')
    expect(normalized.fontSize).toBe(512)
    expect(normalized.fillColor).toBe('#AABBCC')
    expect(normalized.gradientColors).toEqual([
      '#00AAFF',
      '#123456',
      '#FFFFFF',
      '#FDE047',
    ])
    expect(normalized.gradientStops).toEqual([0, 0.5, 0.8, 1])
    expect(normalized.outlineColor).toBe('#9A3412')
    expect(normalized.shadowOpacity).toBe(1)
    expect(normalized.effect).toBe('none')
    expect(input.width).toBe(-20)
  })

  it('resolves a portable gradient, stroke, shadow and safe effect', () => {
    const presentation = resolveWordArtPresentation({
      fillType: 'linear-gradient',
      gradientAngle: 90,
      gradientColors: ['#00FFFF', '#0000FF'],
      gradientStops: [0, 1],
      outlineColor: '#111111',
      outlineWidthEm: 0.05,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      effect: 'perspective-left',
    })

    expect(presentation.backgroundImage).toBe(
      'linear-gradient(90deg, #00FFFF 0%, #0000FF 100%)',
    )
    expect(presentation.textStroke).toBe('0.05em #111111')
    expect(presentation.textShadow).toContain('rgba(0, 0, 0, 0.4)')
    expect(presentation.effectTransform).toBe(
      'perspective(600px) rotateY(-12deg)',
    )
    expect(wordArtPresentationToInlineStyle(presentation.props)).toContain(
      '-webkit-text-fill-color:transparent',
    )
  })

  it('offers the expanded style, font and safe transform catalogs', () => {
    expect(WORD_ART_PRESETS.length).toBe(16)
    expect(WORD_ART_FONT_OPTIONS.length).toBe(10)
    expect(new Set(WORD_ART_PRESETS.map(item => item.id)).size).toBe(16)
    expect(new Set(WORD_ART_FONT_OPTIONS.map(item => item.id)).size).toBe(10)
    expect(resolveWordArtPresentation({effect: 'perspective-up'})
      .effectTransform).toBe('perspective(600px) rotateX(12deg)')
    expect(resolveWordArtPresentation({effect: 'wide'}).effectTransform)
      .toBe('scaleX(1.18)')
  })

  it('keeps corners proportional while side handles reflow one axis', () => {
    const start = {width: 320, height: 96, offsetX: 0, offsetY: 0}
    const corner = calculateWordArtResize('south-east', start, 160, 10)
    const side = calculateWordArtResize('east', start, 80, 200)

    expect(corner.width).toBe(480)
    expect(corner.height).toBe(144)
    expect(side.width).toBe(400)
    expect(side.height).toBe(96)
  })

  it('exposes immutable classic presets without sharing style arrays', () => {
    const preset = getWordArtPreset('ocean')
    expect(preset.id).toBe('ocean')
    expect(preset.props.gradientColors.length).toBeGreaterThanOrEqual(2)
    expect(getWordArtPreset('missing').id).toBe('sunset')
  })
})
