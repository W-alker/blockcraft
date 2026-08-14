import {Component} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import * as Y from 'yjs'
import {
  BlockNodeType,
  type IBlockSnapshot,
  type YBlock,
} from '../../framework'
import {
  DEFAULT_TEXT_BOX_PROPS,
  TextBoxBlockComponent,
  TextBoxBlockSchema,
  normalizeTextBoxProps,
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
} from './index'

@Component({
  selector: 'text-box-focus-style-harness',
  standalone: true,
  template: `
    <div data-blockcraft-root="true">
      <div class="text-box-block">
        <div class="text-box-block__surface" style="width: 160px; height: 64px">
          <div class="text-box-block__content" contenteditable="true">
            <p style="flex: none; height: 240px; margin: 0">可滚动内容</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/blocks/text-box-block.scss',
})
class TextBoxFocusStyleHarness {}

describe('TextBoxBlockSchema', () => {
  it('keeps focused content borderless and scrollable without visible scrollbars', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxFocusStyleHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxFocusStyleHarness)
    fixture.detectChanges()
    const content = fixture.nativeElement.querySelector(
      '.text-box-block__content',
    ) as HTMLElement

    try {
      content.focus()
      const style = getComputedStyle(content)

      expect(document.activeElement).toBe(content)
      expect(style.outlineStyle).toBe('none')
      expect(style.boxShadow).toBe('none')
      expect(style.overflowX).toBe('auto')
      expect(style.overflowY).toBe('auto')
      expect(style.getPropertyValue('scrollbar-width')).toBe('none')

      content.scrollTop = 24
      expect(content.scrollTop).toBeGreaterThan(0)
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
    } finally {
      fixture.destroy()
      yDoc.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('normalizes geometry, surface and absolute placement props', () => {
    const props = normalizeTextBoxProps({
      width: -10,
      height: 4_000,
      rotation: -15,
      p: [8, 16, 8, 16],
      bgi: ' /assets/paper.png ',
      bgs: 'contain',
      backColor: ' transparent ',
      borderColor: ' #334155 ',
      position: {
        x: 32,
        y: 48,
      },
      placementLayer: 'under',
    })

    expect(props).toEqual({
      p: [8, 16],
      bgi: '/assets/paper.png',
      bgs: 'contain',
      bgx: 50,
      bgy: 50,
      bgo: 1,
      width: 48,
      height: 2_000,
      rotation: 345,
      backColor: 'transparent',
      borderColor: '#334155',
      sh: 'rectangle',
      fo: 1,
      bw: 1,
      bs: 'solid',
      position: {
        x: 32,
        y: 48,
      },
      placementLayer: 'under',
    })
  })

  it('normalizes the shape shell and serialized WordArt value object', () => {
    const wa = serializeTextBoxWordArtStyle({
      fillType: 'linear-gradient',
      gradientColors: ['#0EA5E9', '#8B5CF6'],
      gradientStops: [0, 1],
      outlineColor: '#0F172A',
      shadowEnabled: true,
    })
    const props = normalizeTextBoxProps({
      sh: 'line',
      fo: 2,
      bw: -4,
      bs: 'dashed',
      wa,
    })

    expect(props.sh).toBe('rectangle')
    expect(props.fo).toBe(1)
    expect(props.bw).toBe(0)
    expect(props.bs).toBe('dashed')
    expect(normalizeTextBoxWordArtStyle(props.wa)).toEqual(
      jasmine.objectContaining({
        fillType: 'linear-gradient',
        gradientColors: ['#0EA5E9', '#8B5CF6'],
        gradientStops: [0, 1],
        outlineColor: '#0F172A',
        shadowEnabled: true,
      }),
    )
  })

  it('falls back instead of coercing missing dimensions to minimums', () => {
    expect(normalizeTextBoxProps({
      width: null as unknown as number,
      height: Number.NaN,
      rotation: Number.POSITIVE_INFINITY,
    })).toEqual(DEFAULT_TEXT_BOX_PROPS)
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
    expect(TextBoxBlockSchema.metadata.selectionScope).toBe('container')
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
