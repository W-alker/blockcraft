import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {BaseBlockComponent} from './base-block'
import {BlockNodeType} from '../../types'

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss',
  template: `
    <div data-blockcraft-root="true" style="--bc-fs: 16px; --bc-lh: 1.5">
      <p
        data-block-id="heading-typography"
        data-node-type="editable"
        data-heading="1"
        data-bc-block-lh
        class="paragraph-block edit-container"
        style="--bc-block-lh: 2">
        heading
      </p>
      <div
        data-block-id="list-typography"
        data-node-type="editable"
        data-bc-block-lh
        class="bullet-block"
        style="--bc-block-lh: 1.75; --bc-block-fs-scale: 1.5; font-size: 150%">
        <span class="bullet-block-prefix"><span class="point"></span></span>
        <div class="edit-container">list item</div>
      </div>
      <div
        data-block-id="ordered-typography"
        data-node-type="editable"
        class="ordered-block"
        style="--bc-block-fs-scale: 1.5; font-size: 150%">
        <button class="ordered-block-prefix">1.</button>
        <div class="edit-container">ordered item</div>
      </div>
      <div
        data-block-id="todo-typography"
        data-node-type="editable"
        class="todo-block"
        style="--bc-block-fs-scale: .75; font-size: 75%">
        <button class="todo-block-button"><i>✓</i></button>
        <div class="edit-container">todo item</div>
      </div>
      <p
        data-block-id="paragraph-spacing"
        data-node-type="editable"
        class="paragraph-block edit-container"
        style="--bc-block-sa: 6pt; --bc-next-block-sb: 12pt; --bc-block-leading-sb: 4pt">
        spacing
      </p>
      <p data-block-id="paragraph-spacing-next" data-node-type="editable">
        next
      </p>
      <blockquote
        data-block-id="blockquote-spacing"
        data-node-type="editable"
        class="blockquote-block"
        style="--bc-block-leading-sb: 6pt">
        quoted spacing
      </blockquote>
      <div class="paragraph-spacing-boundary">
        <p
          data-block-id="paragraph-spacing-boundary"
          data-node-type="editable"
          style="--bc-block-sb: 9pt; --bc-block-sa: 15pt; --bc-block-leading-sb: 9pt">
          boundary spacing
        </p>
      </div>
      <div class="text-box-block">
        <div class="text-box-block__content">
          <p
            data-block-id="text-box-final-paragraph"
            data-node-type="editable"
            style="--bc-block-sa: 18pt">
            text box final paragraph
          </p>
        </div>
      </div>
      <div
        data-block-id="callout-shell"
        data-node-type="block"
        class="callout-block"
        style="--bc-next-block-sb: 24pt">
        <div class="callout-content">
          <p
            data-block-id="callout-first-paragraph"
            data-node-type="editable">
            callout first paragraph
          </p>
          <p
            data-block-id="callout-final-paragraph"
            data-node-type="editable"
            style="--bc-block-sa: 21pt">
            callout final paragraph
          </p>
        </div>
      </div>
      <p data-block-id="after-callout" data-node-type="editable">
        paragraph after callout
      </p>
    </div>
  `,
})
class BlockTypographyThemeHarness {}

describe('BaseBlockComponent typography projection', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('projects bounded editable typography values as compact CSS variables', () => {
    const block = createBlock({pfs: 1.5, lh: 1.75})

    expect(block.blockFontScale).toBe('1.5')
    expect(block.blockFontSize).toBe('150%')
    expect(block.blockLineHeight).toBe('1.75')
    expect(block.blockLineHeightAttribute).toBe('')
  })

  it('suppresses invalid values and all non-editable projection', () => {
    const invalid = createBlock({lh: 0.5})
    expect(createBlock({pfs: 4}).blockFontScale).toBeNull()
    expect(createBlock({pfs: 4}).blockFontSize).toBeNull()
    expect(invalid.blockLineHeight).toBeNull()
    expect(invalid.blockLineHeightAttribute).toBeNull()

    const nonEditable = createBlock({lh: 1.5}, BlockNodeType.void)
    expect(createBlock({pfs: 1.5}, BlockNodeType.void).blockFontScale).toBeNull()
    expect(createBlock({pfs: 1.5}, BlockNodeType.void).blockFontSize).toBeNull()
    expect(nonEditable.blockLineHeight).toBeNull()
  })

  it('projects bounded paragraph spacing', () => {
    const block = createBlock({psb: 6, psa: 12})
    ;(block as any).doc = {
      model: {
        getPreviousSiblingId: () => null,
        getNextSiblingId: () => 'next',
        getNodeType: () => BlockNodeType.editable,
        getProps: () => ({psb: 20}),
      },
    }

    expect(block.blockSpaceBefore).toBe('6pt')
    expect(block.blockSpaceAfter).toBe('12pt')
    expect(block.leadingBlockSpaceBefore).toBe('6pt')
    expect(block.nextBlockSpaceBefore).toBe('20pt')
  })

  it('applies block line height to headings and normal editable blocks', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockTypographyThemeHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(BlockTypographyThemeHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    const heading = host.querySelector<HTMLElement>(
      '[data-block-id="heading-typography"]',
    )!
    const list = host.querySelector<HTMLElement>(
      '[data-block-id="list-typography"]',
    )!
    expect(Number.parseFloat(getComputedStyle(heading).lineHeight)).toBeCloseTo(64, 3)
    expect(Number.parseFloat(getComputedStyle(list).lineHeight)).toBeCloseTo(42, 3)
    expect(Number.parseFloat(getComputedStyle(list).fontSize)).toBeCloseTo(24, 3)
    expect(Number.parseFloat(getComputedStyle(
      list.querySelector<HTMLElement>('.bullet-block-prefix')!,
    ).fontSize)).toBeCloseTo(24, 3)
    expect(Number.parseFloat(getComputedStyle(
      list.querySelector<HTMLElement>('.bullet-block-prefix .point')!,
    ).width)).toBeCloseTo(9.6, 1)
    const orderedPrefix = host.querySelector<HTMLElement>(
      '[data-block-id="ordered-typography"] .ordered-block-prefix',
    )!
    expect(Number.parseFloat(getComputedStyle(orderedPrefix).fontSize))
      .toBeCloseTo(24, 3)
    const todoButton = host.querySelector<HTMLElement>(
      '[data-block-id="todo-typography"] .todo-block-button',
    )!
    expect(Number.parseFloat(getComputedStyle(todoButton).fontSize))
      .toBeCloseTo(12, 3)
    expect(Number.parseFloat(getComputedStyle(todoButton).minWidth))
      .toBeCloseTo(12, 3)
    const spacing = host.querySelector<HTMLElement>(
      '[data-block-id="paragraph-spacing"]',
    )!
    expect(Number.parseFloat(getComputedStyle(spacing).marginBottom))
      .toBeCloseTo(16, 3)
    expect(Number.parseFloat(getComputedStyle(spacing).paddingBlockStart))
      .toBeCloseTo(16 / 3, 3)

    const blockquote = host.querySelector<HTMLElement>(
      '[data-block-id="blockquote-spacing"]',
    )!
    expect(Number.parseFloat(getComputedStyle(blockquote).paddingBlockStart))
      .toBeCloseTo(18, 3)
    expect(Number.parseFloat(getComputedStyle(blockquote).paddingBlockEnd))
      .toBeCloseTo(10, 3)

    const boundary = host.querySelector<HTMLElement>(
      '[data-block-id="paragraph-spacing-boundary"]',
    )!
    expect(Number.parseFloat(getComputedStyle(boundary).paddingBlockStart))
      .toBeCloseTo(12, 3)
    expect(Number.parseFloat(getComputedStyle(boundary).marginBottom))
      .toBeCloseTo(20, 3)

    const textBoxFinal = host.querySelector<HTMLElement>(
      '[data-block-id="text-box-final-paragraph"]',
    )!
    expect(Number.parseFloat(getComputedStyle(textBoxFinal).marginBlockEnd))
      .toBeCloseTo(24, 3)

    const calloutShell = host.querySelector<HTMLElement>(
      '[data-block-id="callout-shell"]',
    )!
    expect(Number.parseFloat(getComputedStyle(calloutShell).marginBottom))
      .toBeCloseTo(32, 3)

    const calloutFirst = host.querySelector<HTMLElement>(
      '[data-block-id="callout-first-paragraph"]',
    )!
    expect(calloutFirst.style.getPropertyValue('--bc-next-block-sb')).toBe('')
    expect(Number.parseFloat(getComputedStyle(calloutFirst).marginBottom))
      .toBeCloseTo(10, 3)

    const calloutFinal = host.querySelector<HTMLElement>(
      '[data-block-id="callout-final-paragraph"]',
    )!
    expect(Number.parseFloat(getComputedStyle(calloutFinal).marginBottom))
      .toBeCloseTo(28, 3)

    fixture.destroy()
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
