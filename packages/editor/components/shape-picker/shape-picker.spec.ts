import {TestBed} from '@angular/core/testing'
import {By} from '@angular/platform-browser'
import {CsTooltipDirective} from '@cses/ui'
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  type ShapeKind,
} from '../../blocks/shape-block'
import {ShapePickerComponent} from './shape-picker'

describe('ShapePickerComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders the complete Word-like catalog in labeled categories', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapePickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapePickerComponent)
    fixture.componentRef.setInput('current', 'flow-decision')
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const categories = host.querySelectorAll('.shape-picker__category')
    const items = host.querySelectorAll<HTMLButtonElement>(
      '[data-shape-type]',
    )

    expect(categories.length).toBe(SHAPE_CATEGORIES.length)
    expect(items.length).toBe(SHAPE_DEFINITIONS.length)
    expect(
      host.querySelector('[data-shape-type="flow-decision"]')
        ?.classList.contains('active'),
    ).toBeTrue()
    expect(
      host.querySelector('[data-shape-type="flow-decision"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      host.querySelector('[data-shape-type="line"] bc-shape-icon'),
    ).not.toBeNull()
    const decision = fixture.debugElement.query(
      By.css('[data-shape-type="flow-decision"]'),
    )
    expect(decision.injector.get(CsTooltipDirective).csTooltip())
      .toBe('流程：决策')
    expect(decision.nativeElement.textContent.trim()).toBe('')
  })

  it('preserves editor selection on press and emits the selected type', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapePickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapePickerComponent)
    const picked: ShapeKind[] = []
    fixture.componentInstance.pick.subscribe(value => picked.push(value))
    fixture.detectChanges()
    const button = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-shape-type="star-8"]')!
    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    })

    button.dispatchEvent(mouseDown)
    button.click()

    expect(mouseDown.defaultPrevented).toBeTrue()
    expect(picked).toEqual(['star-8'])
  })

  it('can restrict the catalog to shapes that support a text frame', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapePickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapePickerComponent)
    fixture.componentRef.setInput('supportsTextOnly', true)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('[data-shape-type="rounded-rectangle"]'))
      .not.toBeNull()
    expect(host.querySelector('[data-shape-type="line"]')).toBeNull()
    expect(host.querySelector('[data-shape-type="curved-connector"]')).toBeNull()
  })

  it('removes standalone popup chrome when embedded in a settings card', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapePickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapePickerComponent)
    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()

    expect((fixture.nativeElement as HTMLElement).classList)
      .toContain('shape-picker-host--embedded')
  })
})
