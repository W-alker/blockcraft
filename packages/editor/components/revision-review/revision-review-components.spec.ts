import {TestBed} from '@angular/core/testing'
import {BehaviorSubject, Subject} from 'rxjs'
import type {RevisionOverlapConflict} from '../../framework'
import type {
  RevisionReviewItem,
  RevisionReviewState,
} from '../../plugins/revision-review'
import {RevisionReviewPanelComponent} from './revision-review-panel.component'
import {layoutRevisionReviewCards} from './revision-review-panel.layout'
import {RevisionReviewPopoverComponent} from './revision-review-popover.component'

const actor = {
  actorId: 'actor-a',
  displayName: '王晓明',
  color: '#5965dc',
}

function item(index = 0): RevisionReviewItem {
  return {
    id: `group-${index}`,
    revisionIds: [`revision-${index}`],
    kinds: [index % 2 ? 'text-delete' : 'text-insert'],
    actors: [actor],
    createdAt: '2026-08-27T01:02:03.000Z',
    updatedAt: '2026-08-27T01:02:03.000Z',
    status: 'pending',
    blockIds: [`block-${index}`],
    dependsOn: [],
    activeDecisionIds: [],
    overlapConflictIds: [],
  }
}

function state(items: readonly RevisionReviewItem[]): RevisionReviewState {
  return {
    mode: 'track',
    viewMode: 'markup',
    epoch: 2,
    items,
    activeItemId: items[0]?.id ?? null,
    activeItem: items[0] ?? null,
    activeIndex: items.length ? 0 : -1,
    pendingItemCount: items.length,
    pendingRevisionCount: items.length,
    conflicts: [],
  }
}

describe('Revision review default UI', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('keeps the floating popover presentational and emits keep/revert intents', async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionReviewPopoverComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(RevisionReviewPopoverComponent)
    const intents: unknown[] = []
    fixture.componentRef.setInput('item', item())
    fixture.componentInstance.intent.subscribe(value => intents.push(value))
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).toContain('王晓明')
    expect(host.querySelector('time')?.getAttribute('datetime'))
      .toBe('2026-08-27T01:02:03.000Z')
    expect(host.textContent).not.toContain('新增文字')
    expect(host.getBoundingClientRect().height).toBeLessThanOrEqual(40)
    expect(host.querySelector('[aria-label="上一条修订"]')).toBeNull()
    expect(host.querySelector('[aria-label="下一条修订"]')).toBeNull()
    const revertButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="拒绝修订"]',
    )!
    const keepButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="接收修订"]',
    )!
    expect(revertButton.querySelector('.bc_x-01')).not.toBeNull()
    expect(keepButton.querySelector('.bc_check-ok')).not.toBeNull()
    revertButton.click()
    keepButton.click()

    expect(intents).toEqual([
      {type: 'revert', itemId: 'group-0'},
      {type: 'keep', itemId: 'group-0'},
    ])
  })

  it('disables default decisions in the final view without inferring a role', async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionReviewPopoverComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(RevisionReviewPopoverComponent)
    fixture.componentRef.setInput('item', item())
    fixture.componentRef.setInput('viewMode', 'final')
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const decisionButtons = Array.from(host.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="拒绝修订"], button[aria-label="接收修订"]',
    ))
    expect(decisionButtons.every(button => button.disabled)).toBeTrue()
    expect(host.querySelector('section')?.getAttribute('title'))
      .toContain('最终视图只读')
  })

  it('projects mounted revision anchors with document scroll and refreshes affected groups only', async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionReviewPanelComponent],
    }).compileComponents()
    const contentChange$ = new Subject<{blockIds: readonly string[]}>()
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
    const items = Array.from({length: 160}, (_, index) => item(index))
    const state$ = new BehaviorSubject(state(items))
    const scrollContainer = document.createElement('div')
    const root = document.createElement('div')
    const firstBlock = document.createElement('p')
    const secondBlock = document.createElement('p')
    const firstMarker = document.createElement('c-element')
    const secondMarker = document.createElement('c-element')
    firstBlock.dataset['blockId'] = 'block-0'
    secondBlock.dataset['blockId'] = 'block-1'
    firstMarker.setAttribute('data-bc-revision-ids', 'revision-0')
    secondMarker.setAttribute('data-bc-revision-ids', 'revision-1')
    firstBlock.append(firstMarker)
    secondBlock.append(secondMarker)
    root.append(firstBlock, secondBlock)
    root.style.height = '2000px'
    scrollContainer.style.height = '100px'
    scrollContainer.style.overflow = 'auto'
    scrollContainer.append(root)
    document.body.append(scrollContainer)
    let firstMarkerTop = 140
    spyOn(firstMarker, 'getBoundingClientRect').and.callFake(() =>
      rectAt(firstMarkerTop, 18))
    spyOn(secondMarker, 'getBoundingClientRect').and.returnValue(rectAt(340, 18))
    const doc = {
      ngZone: {
        run: (callback: () => void) => callback(),
        runOutsideAngular: (callback: () => void) => callback(),
      },
      model: {
        contentChange$,
      },
      root: {hostElement: root},
      scrollContainer,
      virtualization: {viewChange$},
    }
    const readContent = jasmine.createSpy('readContent')
      .and.callFake((itemId: string) => [{
        revisionId: itemId.replace('group', 'revision'),
        kind: Number(itemId.split('-')[1]) % 2 ? 'text-delete' : 'text-insert',
        text: `revision fragment ${itemId}`,
      }])
    const review = {state$, readContent}
    const fixture = TestBed.createComponent(RevisionReviewPanelComponent)
    const intents: unknown[] = []
    fixture.componentInstance.intent.subscribe(value => intents.push(value))
    ;(fixture.nativeElement as HTMLElement).style.height = '620px'
    fixture.componentRef.setInput('doc', doc)
    fixture.componentRef.setInput('review', review)
    fixture.detectChanges()
    await fixture.whenStable()
    const listShell = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.revision-panel__list-shell')!
    spyOn(listShell, 'getBoundingClientRect').and.returnValue(rectAt(40, 500))
    scrollContainer.dispatchEvent(new Event('scroll'))
    await animationFrames(2)
    fixture.detectChanges()

    const renderedCards = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.revision-card').length
    expect(renderedCards).toBeGreaterThan(0)
    expect(renderedCards).toBeLessThan(items.length)
    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).toContain('revision fragment group-0')
    const firstArticle = host.querySelector<HTMLElement>('.revision-card')!
    expect(firstArticle.getBoundingClientRect().height).toBeLessThanOrEqual(90)
    const nextButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="下一条修订"]',
    )!
    expect(nextButton.textContent?.trim()).toBe('')
    expect(nextButton.querySelector('.bc_chevron-left')).not.toBeNull()
    expect(host.querySelector('[aria-label="拒绝修订"] .bc_x-01')).not.toBeNull()
    expect(host.querySelector('[aria-label="接收修订"] .bc_check-ok')).not.toBeNull()
    const firstCard = host.querySelector<HTMLElement>('.revision-panel__row')!
    expect(firstCard.style.transform).toBe('translate3d(0px, 100px, 0px)')
    expect(getComputedStyle(host.querySelector('.revision-panel')!).overflowX)
      .toBe('hidden')
    nextButton.click()
    expect(intents).toContain({type: 'activate', itemId: 'group-1'})

    readContent.calls.reset()
    contentChange$.next({blockIds: ['block-77']})
    fixture.detectChanges()
    expect(readContent).toHaveBeenCalledOnceWith('group-77')

    firstMarkerTop = 90
    scrollContainer.dispatchEvent(new Event('scroll'))
    await animationFrames(1)
    fixture.detectChanges()
    expect(firstCard.style.transform).toBe('translate3d(0px, 50px, 0px)')

    host.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 64,
      cancelable: true,
    }))
    expect(scrollContainer.scrollTop).toBe(64)

    const acceptedItems = items.map((candidate, index) => index === 0
      ? {...candidate, status: 'accepted' as const}
      : candidate)
    state$.next({
      ...state(acceptedItems),
      pendingItemCount: items.length - 1,
      pendingRevisionCount: items.length - 1,
    })
    fixture.detectChanges()
    expect(host.querySelector(
      '[data-revision-review-item-id="group-0"]',
    )).toBeNull()
    expect(host.querySelector('.revision-panel__filters .is-active')?.textContent)
      .toContain('待处理')

    fixture.destroy()
    viewChange$.complete()
    scrollContainer.remove()
  })

  it('shows one readable structural conflict with exact choices instead of former/latter labels', async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionReviewPanelComponent],
    }).compileComponents()
    const first = {
      ...item(0),
      kinds: ['block-insert'] as const,
      blockIds: ['shared-block'],
      overlapConflictIds: ['conflict-a'],
    }
    const second = {
      ...item(1),
      kinds: ['block-delete'] as const,
      actors: [{actorId: 'actor-b', displayName: '陈蕾', color: '#d75555'}],
      blockIds: ['shared-block'],
      overlapConflictIds: ['conflict-a', 'conflict-b'],
    }
    const third = {
      ...item(2),
      kinds: ['block-split'] as const,
      actors: [{actorId: 'actor-c', displayName: '李四', color: '#2f9c74'}],
      blockIds: ['shared-block'],
      overlapConflictIds: ['conflict-b'],
    }
    const conflicts: RevisionOverlapConflict[] = [{
      id: 'conflict-a',
      revisionIds: ['revision-0', 'revision-1'],
      blockIds: ['shared-block'],
      kind: 'structure-overlap',
    }, {
      id: 'conflict-b',
      revisionIds: ['revision-1', 'revision-2'],
      blockIds: ['shared-block'],
      kind: 'structure-overlap',
    }]
    const contentByGroup = new Map([
      ['group-0', [{
        revisionId: 'revision-0',
        kind: 'block-insert' as const,
        text: '新增销售方案',
      }]],
      ['group-1', [{
        revisionId: 'revision-1',
        kind: 'block-delete' as const,
        text: '删除旧销售方案',
      }]],
      ['group-2', [{
        revisionId: 'revision-2',
        kind: 'block-split' as const,
        text: '',
      }]],
    ])
    const reviewState = {
      ...state([first, second, third]),
      conflicts,
    }
    const state$ = new BehaviorSubject<RevisionReviewState>(reviewState)
    const readContent = jasmine.createSpy('readContent').and.callFake(
      (itemId: string) => contentByGroup.get(itemId) ?? [],
    )
    const contentChange$ = new Subject<{blockIds: readonly string[]}>()
    const viewChange$ = new Subject<unknown>()
    const scrollContainer = document.createElement('div')
    const root = document.createElement('div')
    scrollContainer.append(root)
    document.body.append(scrollContainer)
    const doc = {
      ngZone: {
        run: (callback: () => void) => callback(),
        runOutsideAngular: (callback: () => void) => callback(),
      },
      model: {contentChange$},
      root: {hostElement: root},
      scrollContainer,
      virtualization: {viewChange$},
    }
    const fixture = TestBed.createComponent(RevisionReviewPanelComponent)
    const intents: unknown[] = []
    fixture.componentInstance.intent.subscribe(value => intents.push(value))
    fixture.componentRef.setInput('doc', doc)
    fixture.componentRef.setInput('review', {state$, readContent})
    fixture.detectChanges()
    await fixture.whenStable()

    const host = fixture.nativeElement as HTMLElement
    const conflictSection = host.querySelector<HTMLElement>(
      '.revision-panel__conflicts',
    )!
    expect(conflictSection.textContent).toContain('结构修订冲突')
    expect(conflictSection.textContent).toContain('2 组待处理')
    expect(conflictSection.textContent).toContain('只能接收其中一项')
    expect(conflictSection.textContent).toContain('王晓明')
    expect(conflictSection.textContent).toContain('新增内容块')
    expect(conflictSection.textContent).toContain('新增销售方案')
    expect(conflictSection.textContent).toContain('陈蕾')
    expect(conflictSection.textContent).toContain('删除旧销售方案')
    expect(conflictSection.textContent).not.toContain('接收前者')
    expect(conflictSection.querySelectorAll(
      '.revision-panel__conflict-choice',
    ).length).toBe(2)

    conflictSection.querySelector<HTMLButtonElement>(
      '[aria-label="下一组冲突"]',
    )!.click()
    fixture.detectChanges()
    expect(conflictSection.textContent).toContain('2/2')
    expect(conflictSection.textContent).toContain('李四')
    expect(conflictSection.textContent).toContain('拆分段落')
    expect(conflictSection.textContent).toContain('段落边界')
    conflictSection.querySelector<HTMLButtonElement>(
      '[aria-label="接收 李四的拆分段落修订"]',
    )!.click()
    expect(intents).toEqual([{
      type: 'resolve-overlap',
      conflictId: 'conflict-b',
      keepRevisionIds: ['revision-2'],
    }])

    fixture.destroy()
    scrollContainer.remove()
  })

  it('keeps the active anchor pinned while resolving card collisions', () => {
    const result = layoutRevisionReviewCards([
      {value: 'before', anchorTop: 90, height: 80},
      {value: 'active', anchorTop: 100, height: 80, anchorPinned: true},
      {value: 'after', anchorTop: 110, height: 80},
    ], 8)

    expect(result.find(card => card.value === 'active')?.top).toBe(100)
    expect(result[0].top + result[0].height + 8).toBeLessThanOrEqual(result[1].top)
    expect(result[1].top + result[1].height + 8).toBeLessThanOrEqual(result[2].top)
  })
})

function rectAt(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 200,
    bottom: top + height,
    left: 0,
    width: 200,
    height,
    toJSON: () => ({}),
  }
}

function animationFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    const next = (remaining: number) => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => next(remaining - 1))
    }
    next(count)
  })
}
