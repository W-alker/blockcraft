import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../themes/base.scss',
  template: `
    <div
      data-blockcraft-root="true"
      style="
        --bc-revision-insert-color: rgb(19, 115, 51);
        --bc-revision-delete-color: rgb(197, 34, 31);
        --bc-revision-conflict-color: rgb(176, 96, 0);
      "
    >
      <div
        data-block-id="absolute-insert"
        data-bc-placement="absolute"
        data-bc-revision-kind="insert"
        data-bc-revision-state="pending"
      ></div>
      <div
        data-block-id="absolute-delete"
        data-bc-placement="absolute"
        data-bc-revision-kind="delete"
        data-bc-revision-state="pending"
      ></div>
      <div
        data-block-id="absolute-conflict"
        data-bc-placement="absolute"
        data-bc-revision-kind="insert"
        data-bc-revision-state="conflict"
      ></div>
    </div>
  `,
})
class RevisionPresentationHarness {}

describe('revision presentation', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('uses an external outline for absolute objects without changing their layer', async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionPresentationHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(RevisionPresentationHarness)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    const insertion = getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-insert"]')!,
    )
    expect(insertion.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(insertion.boxShadow).toBe('none')
    expect(insertion.outlineColor).toBe('rgb(19, 115, 51)')
    expect(insertion.outlineStyle).toBe('solid')
    expect(insertion.outlineWidth).toBe('2px')
    expect(insertion.outlineOffset).toBe('3px')
    expect(insertion.zIndex).toBe('auto')

    const deletion = getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-delete"]')!,
    )
    expect(deletion.outlineColor).toBe('rgb(197, 34, 31)')
    expect(deletion.outlineStyle).toBe('dashed')

    const conflict = getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-conflict"]')!,
    )
    expect(conflict.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(conflict.outlineColor).toBe('rgb(176, 96, 0)')
    expect(conflict.outlineStyle).toBe('double')
    expect(conflict.outlineWidth).toBe('3px')

    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    root.setAttribute('data-bc-revision-view', 'final')
    expect(getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-insert"]')!,
    ).outlineStyle).toBe('none')
    expect(getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-delete"]')!,
    ).outlineStyle).toBe('none')
    expect(getComputedStyle(
      host.querySelector<HTMLElement>('[data-block-id="absolute-conflict"]')!,
    ).outlineStyle).toBe('none')

    fixture.destroy()
  })
})
