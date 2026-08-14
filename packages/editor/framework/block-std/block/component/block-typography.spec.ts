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
        style="--bc-block-lh: 1.75">
        <span class="bullet-block-prefix">•</span>
        <div class="edit-container">list item</div>
      </div>
    </div>
  `,
})
class BlockTypographyThemeHarness {}

describe('BaseBlockComponent typography projection', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('projects bounded editable typography values as compact CSS variables', () => {
    const block = createBlock({lh: 1.75})

    expect(block.blockLineHeight).toBe('1.75')
    expect(block.blockLineHeightAttribute).toBe('')
  })

  it('suppresses invalid values and all non-editable projection', () => {
    const invalid = createBlock({lh: 0.5})
    expect(invalid.blockLineHeight).toBeNull()
    expect(invalid.blockLineHeightAttribute).toBeNull()

    const nonEditable = createBlock({lh: 1.5}, BlockNodeType.void)
    expect(nonEditable.blockLineHeight).toBeNull()
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
    expect(Number.parseFloat(getComputedStyle(list).lineHeight)).toBeCloseTo(28, 3)

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
