import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {BaseBlockComponent} from './base-block'
import {BlockNodeType} from '../../types'

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss',
  template: `
    <div data-blockcraft-root="true">
      <p
        data-block-id="paragraph-focused"
        data-node-type="editable"
        data-bc-block-border
        class="paragraph-block focused"
        style="--bc-block-border-color: rgb(223, 171, 1)">
        focused paragraph
      </p>
      <p
        data-block-id="paragraph-selected"
        data-node-type="editable"
        data-bc-block-border
        class="paragraph-block selected"
        style="--bc-block-border-color: rgb(223, 171, 1)">
        selected paragraph
      </p>
      <blockquote
        data-block-id="quote-focused"
        data-node-type="editable"
        data-bc-block-border
        class="blockquote-block focused"
        style="--bc-block-border-color: rgb(223, 171, 1)">
        focused
      </blockquote>
      <blockquote
        data-block-id="quote-selected"
        data-node-type="editable"
        data-bc-block-border
        class="blockquote-block selected"
        style="--bc-block-border-color: rgb(223, 171, 1)">
        selected
      </blockquote>
      <div
        data-block-id="formula-selected"
        data-node-type="void"
        data-bc-block-border
        class="formula-block selected"
        style="--bc-block-border-color: rgb(223, 171, 1); --bc-active-color: rgb(72, 87, 226)">
        selected formula
      </div>
    </div>
  `,
})
class BlockAppearanceThemeHarness {}

describe('BaseBlockComponent block appearance projection', () => {
  it('projects trimmed block colors and suppresses transparent values', () => {
    const block = createBlock({
      backColor: '  #ffe6cd  ',
      borderColor: 'transparent',
    })

    expect(block.blockBackgroundColor).toBe('#ffe6cd')
    expect(block.blockBackgroundAttribute).toBe('')
    expect(block.blockBorderColor).toBeNull()
    expect(block.blockBorderAttribute).toBeNull()
  })

  it('does not project block appearance onto the root document surface', () => {
    const block = createBlock(
      {backColor: '#fff', borderColor: '#000'},
      BlockNodeType.root,
    )

    expect(block.blockBackgroundColor).toBeNull()
    expect(block.blockBackgroundAttribute).toBeNull()
    expect(block.blockBorderColor).toBeNull()
    expect(block.blockBorderAttribute).toBeNull()
  })

  it('does not project appearance colors onto non-editable blocks', () => {
    const block = createBlock(
      {backColor: '#fff', borderColor: '#000'},
      BlockNodeType.void,
    )

    expect(block.blockBackgroundColor).toBeNull()
    expect(block.blockBackgroundAttribute).toBeNull()
    expect(block.blockBorderColor).toBeNull()
    expect(block.blockBorderAttribute).toBeNull()
  })

  it('preserves a persisted border color while focused or selected', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockAppearanceThemeHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(BlockAppearanceThemeHarness)
    fixture.detectChanges()

    const paragraphs = (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLElement>('.paragraph-block[data-bc-block-border]')
    expect(paragraphs.length).toBe(2)
    for (const paragraph of Array.from(paragraphs)) {
      const computed = getComputedStyle(paragraph)
      expect(computed.borderStyle).toBe('none')
      expect(computed.outlineColor).toBe('rgb(223, 171, 1)')
      expect(computed.outlineStyle).toBe('solid')
      expect(computed.outlineWidth).toBe('1px')
      expect(computed.borderRadius).toBe('4px')
    }

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('keeps a block-specific selected outline above the persisted color', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockAppearanceThemeHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(BlockAppearanceThemeHarness)
    fixture.detectChanges()

    const formula = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.formula-block.selected')!
    const computed = getComputedStyle(formula)
    expect(computed.outlineColor).toBe('rgb(72, 87, 226)')
    expect(computed.outlineWidth).toBe('1px')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('maps blockquote border color to its left accent bar', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockAppearanceThemeHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(BlockAppearanceThemeHarness)
    fixture.detectChanges()

    const quotes = (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLElement>('.blockquote-block[data-bc-block-border]')
    expect(quotes.length).toBe(2)
    for (const quote of Array.from(quotes)) {
      const hostStyle = getComputedStyle(quote)
      const barStyle = getComputedStyle(quote, '::before')
      expect(hostStyle.borderStyle).toBe('none')
      expect(hostStyle.borderRadius).toBe('4px')
      expect(barStyle.backgroundColor).toBe('rgb(223, 171, 1)')
      expect(barStyle.width).toBe('1px')
    }

    fixture.destroy()
    TestBed.resetTestingModule()
  })
})

function createBlock(
  props: Record<string, unknown>,
  nodeType: BlockNodeType = BlockNodeType.editable,
): BaseBlockComponent {
  const block = Object.create(BaseBlockComponent.prototype) as BaseBlockComponent
  Object.assign(block as any, {
    _native: {
      id: 'block-1',
      flavour: nodeType === BlockNodeType.root ? 'root' : 'paragraph',
      nodeType,
      props,
      meta: {},
      children: [],
    },
  })
  return block
}
