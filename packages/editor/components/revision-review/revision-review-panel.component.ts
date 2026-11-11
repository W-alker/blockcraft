import {DatePipe} from '@angular/common'
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import {CsButtonComponent, CsTooltipDirective} from '@cses/ui'
import {Subscription} from 'rxjs'
import type {BlockCraftDoc} from '../../framework/doc'
import type {RevisionOverlapConflict} from '../../framework/revision'
import type {
  RevisionReviewContentSegment,
  RevisionReviewItem,
  RevisionReviewPlugin,
  RevisionReviewState,
} from '../../plugins/revision-review'
import type {
  RevisionReviewFilter,
  RevisionReviewIntent,
} from './revision-review.types'
import {
  readRevisionIds,
  REVISION_MARK_SELECTOR,
} from './revision-review-dom'
import {layoutRevisionReviewCards} from './revision-review-panel.layout'

interface RevisionReviewCardView {
  readonly item: RevisionReviewItem
  readonly contentSegments: readonly RevisionReviewContentSegment[]
  readonly actorName: string
  readonly actorInitial: string
  readonly actorColor: string
  readonly label: string
  readonly revisionText: string
  readonly statusLabel: string
  readonly keepLabel: string
  readonly revertLabel: string
}

interface PositionedRevisionReviewCardView extends RevisionReviewCardView {
  readonly top: number
}

interface RevisionConflictChoiceView {
  readonly revisionId: string
  readonly actorName: string
  readonly actorInitial: string
  readonly actorColor: string
  readonly createdAt: string
  readonly label: string
  readonly revisionText: string
  readonly acceptLabel: string
}

interface RevisionConflictCardView {
  readonly conflict: RevisionOverlapConflict
  readonly choices: readonly RevisionConflictChoiceView[]
}

const ESTIMATED_CARD_HEIGHT = 84
const CARD_GAP = 8
const REVISION_TEXT_LENGTH = 96

@Component({
  selector: 'bc-revision-review-panel',
  standalone: true,
  imports: [
    DatePipe,
    CsButtonComponent,
    CsTooltipDirective,
  ],
  templateUrl: './revision-review-panel.component.html',
  styleUrl: './revision-review-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionReviewPanelComponent
  implements OnChanges, AfterViewInit, OnDestroy {
  @Input({required: true}) doc!: BlockCraftDoc
  @Input({required: true}) review!: RevisionReviewPlugin
  /** Host-owned authorization snapshot. The component never derives roles. */
  @Input() canReview = true
  @Input() closable = true
  @Output() readonly intent = new EventEmitter<RevisionReviewIntent>()
  @ViewChild('listShell', {read: ElementRef})
  private listShell?: ElementRef<HTMLElement>

  protected state: RevisionReviewState | null = null
  protected filter: RevisionReviewFilter = 'pending'
  protected cards: readonly PositionedRevisionReviewCardView[] = []
  protected filteredCards: readonly RevisionReviewCardView[] = []
  protected conflictCards: readonly RevisionConflictCardView[] = []
  protected activeConflictIndex = 0
  protected actionsDisabled = false

  private subscription = Subscription.EMPTY
  private allCards: readonly RevisionReviewCardView[] = []
  private filteredCardById = new Map<string, RevisionReviewCardView>()
  private cardCache = new Map<string, RevisionReviewCardView>()
  private itemIdsByBlock = new Map<string, Set<string>>()
  private itemIdByRevisionId = new Map<string, string>()
  private cardHeightById = new Map<string, number>()
  private projectionScrollContainer: HTMLElement | null = null
  private projectionWindow: Window | null = null
  private projectionFrame = 0
  private projectionBindFrame = 0
  private resizeObserver: ResizeObserver | null = null
  private viewReady = false
  private destroyed = false

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['doc'] || changes['review']) {
      this.subscription.unsubscribe()
      this.unbindProjection()
      this.cardCache.clear()
      this.cardHeightById.clear()
      this.itemIdsByBlock.clear()
      this.itemIdByRevisionId.clear()
      this.subscription = new Subscription()
      this.subscription.add(this.review.state$.subscribe(state => this.applyState(state)))
      this.subscription.add(this.doc.model.contentChange$.subscribe(change => {
        this.refreshRevisionTexts(change.blockIds)
        this.scheduleProjection()
      }))
      this.subscription.add(this.doc.virtualization.viewChange$.subscribe(() => {
        this.scheduleProjection()
      }))
      if (this.viewReady) this.bindProjection()
    } else if (changes['canReview'] && this.state) {
      this.actionsDisabled = !this.canReview || this.state.viewMode === 'final'
      this.cdr.markForCheck()
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true
    this.runOutsideAngular(() => {
      this.host.nativeElement.addEventListener('wheel', this.onPanelWheel, {
        passive: false,
      })
    })
    this.bindProjection()
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.subscription.unsubscribe()
    this.host.nativeElement.removeEventListener('wheel', this.onPanelWheel)
    this.unbindProjection()
  }

  protected setFilter(filter: RevisionReviewFilter): void {
    if (this.filter === filter) return
    this.filter = filter
    this.applyFilter()
    this.cdr.markForCheck()
    this.scheduleProjection()
  }

  protected activate(itemId: string): void {
    this.intent.emit({type: 'activate', itemId})
  }

  protected keep(itemId: string): void {
    this.intent.emit({type: 'keep', itemId})
  }

  protected revert(itemId: string): void {
    this.intent.emit({type: 'revert', itemId})
  }

  protected close(): void {
    this.intent.emit({type: 'close'})
  }

  protected navigateRelative(itemId: string, direction: -1 | 1): void {
    const currentIndex = this.filteredCards.findIndex(card => card.item.id === itemId)
    if (currentIndex < 0 || this.filteredCards.length < 2) return
    const targetIndex = (
      currentIndex + direction + this.filteredCards.length
    ) % this.filteredCards.length
    this.activate(this.filteredCards[targetIndex].item.id)
  }

  protected cardPosition(itemId: string): number {
    const index = this.filteredCards.findIndex(card => card.item.id === itemId)
    return index < 0 ? 0 : index + 1
  }

  protected keepConflict(
    conflict: RevisionOverlapConflict,
    revisionId: string,
  ): void {
    if (!conflict.revisionIds.includes(revisionId)) return
    this.intent.emit({
      type: 'resolve-overlap',
      conflictId: conflict.id,
      keepRevisionIds: [revisionId],
    })
  }

  protected get activeConflict(): RevisionConflictCardView | null {
    return this.conflictCards[this.activeConflictIndex] ?? null
  }

  protected navigateConflict(direction: -1 | 1): void {
    if (this.conflictCards.length < 2) return
    this.activeConflictIndex = (
      this.activeConflictIndex + direction + this.conflictCards.length
    ) % this.conflictCards.length
    this.cdr.markForCheck()
  }

  private applyState(state: RevisionReviewState): void {
    const previousConflictId = this.activeConflict?.conflict.id ?? null
    this.state = state
    this.actionsDisabled = !this.canReview || state.viewMode === 'final'
    this.itemIdsByBlock.clear()
    this.itemIdByRevisionId.clear()
    this.allCards = state.items.map(item => {
      item.blockIds.forEach(blockId => {
        const ids = this.itemIdsByBlock.get(blockId) ?? new Set<string>()
        ids.add(item.id)
        this.itemIdsByBlock.set(blockId, ids)
      })
      item.revisionIds.forEach(revisionId =>
        this.itemIdByRevisionId.set(revisionId, item.id))
      return this.cardFor(item)
    })
    const liveIds = new Set(state.items.map(item => item.id))
    for (const itemId of this.cardCache.keys()) {
      if (!liveIds.has(itemId)) this.cardCache.delete(itemId)
    }
    for (const itemId of this.cardHeightById.keys()) {
      if (!liveIds.has(itemId)) this.cardHeightById.delete(itemId)
    }
    this.conflictCards = this.buildConflictCards(state.conflicts)
    const retainedConflictIndex = previousConflictId
      ? this.conflictCards.findIndex(card => card.conflict.id === previousConflictId)
      : -1
    this.activeConflictIndex = retainedConflictIndex >= 0
      ? retainedConflictIndex
      : Math.min(this.activeConflictIndex, Math.max(0, this.conflictCards.length - 1))
    this.applyFilter()
    this.cdr.markForCheck()
    this.scheduleProjection()
  }

  private applyFilter(): void {
    this.filteredCards = this.allCards.filter(card => {
      if (this.filter === 'pending') {
        return card.item.status === 'pending' || card.item.status === 'conflict'
      }
      if (this.filter === 'resolved') {
        return card.item.status === 'accepted' || card.item.status === 'rejected'
      }
      return true
    })
    this.filteredCardById = new Map(
      this.filteredCards.map(card => [card.item.id, card]),
    )
    this.cards = this.cards.flatMap(card => {
      const current = this.filteredCardById.get(card.item.id)
      return current ? [{...current, top: card.top}] : []
    })
  }

  private cardFor(item: RevisionReviewItem, refreshContent = false): RevisionReviewCardView {
    const previous = this.cardCache.get(item.id)
    if (!refreshContent && previous?.item === item) return previous
    const actor = item.actors[0]
    const actorName = actor?.displayName || actor?.actorId || '未知协作者'
    const contentSegments = refreshContent || !previous
      ? readItemRevisionContent(this.review, item)
      : previous.contentSegments
    const card: RevisionReviewCardView = {
      item,
      contentSegments,
      actorName,
      actorInitial: Array.from(actorName.trim())[0] ?? '?',
      actorColor: actor?.color || 'var(--bc-active-color)',
      label: summarizeKinds(item),
      revisionText: summarizeRevisionContent(contentSegments, item),
      statusLabel: statusLabel(item.status),
      keepLabel: item.status === 'rejected' ? '改为接收修订' : '接收修订',
      revertLabel: item.status === 'accepted' ? '改为拒绝修订' : '拒绝修订',
    }
    this.cardCache.set(item.id, card)
    return card
  }

  private buildConflictCards(
    conflicts: readonly RevisionOverlapConflict[],
  ): readonly RevisionConflictCardView[] {
    const cardById = new Map(this.allCards.map(card => [card.item.id, card]))
    return conflicts.flatMap(conflict => {
      const choices = conflict.revisionIds.flatMap(revisionId => {
        const itemId = this.itemIdByRevisionId.get(revisionId)
        const card = itemId ? cardById.get(itemId) : undefined
        if (!card) return []
        const segment = card.contentSegments.find(
          candidate => candidate.revisionId === revisionId,
        )
        const label = segment ? revisionKindLabel(segment.kind) : card.label
        const revisionText = segment
          ? revisionSegmentText(segment, card.item)
          : card.revisionText
        return [{
          revisionId,
          actorName: card.actorName,
          actorInitial: card.actorInitial,
          actorColor: card.actorColor,
          createdAt: card.item.createdAt,
          label,
          revisionText,
          acceptLabel: `接收 ${card.actorName}的${label}修订`,
        }]
      })
      return choices.length > 1 ? [{conflict, choices}] : []
    })
  }

  private refreshRevisionTexts(blockIds: readonly string[]): void {
    const affectedItemIds = new Set<string>()
    blockIds.forEach(blockId => this.itemIdsByBlock.get(blockId)
      ?.forEach(itemId => affectedItemIds.add(itemId)))
    if (!affectedItemIds.size) return
    let changed = false
    this.allCards = this.allCards.map(card => {
      if (!affectedItemIds.has(card.item.id)) return card
      changed = true
      return this.cardFor(card.item, true)
    })
    if (!changed) return
    this.conflictCards = this.buildConflictCards(this.state?.conflicts ?? [])
    this.applyFilter()
    this.cdr.markForCheck()
  }

  private bindProjection(): void {
    if (!this.viewReady || this.destroyed) return
    const scrollContainer = this.doc.scrollContainer
    if (!scrollContainer) {
      this.scheduleProjectionBindRetry()
      return
    }

    const ownerWindow = scrollContainer.ownerDocument.defaultView ?? window
    if (
      this.projectionScrollContainer === scrollContainer &&
      this.projectionWindow === ownerWindow
    ) {
      this.scheduleProjection()
      return
    }

    this.unbindProjection()
    this.projectionScrollContainer = scrollContainer
    this.projectionWindow = ownerWindow
    this.runOutsideAngular(() => {
      scrollContainer.addEventListener('scroll', this.onScrollOrResize, {
        passive: true,
      })
      ownerWindow.addEventListener('resize', this.onScrollOrResize, {
        passive: true,
      })
      const ResizeObserverCtor = ownerWindow.ResizeObserver
      if (ResizeObserverCtor) {
        this.resizeObserver = new ResizeObserverCtor(this.onScrollOrResize)
        this.resizeObserver.observe(scrollContainer)
        const rootHost = this.readRootHost()
        if (rootHost) this.resizeObserver.observe(rootHost)
        if (this.listShell) this.resizeObserver.observe(this.listShell.nativeElement)
      }
    })
    this.scheduleProjection()
  }

  private scheduleProjectionBindRetry(): void {
    if (this.destroyed || this.projectionBindFrame) return
    const ownerWindow = this.host.nativeElement.ownerDocument.defaultView ?? window
    this.projectionBindFrame = ownerWindow.requestAnimationFrame(() => {
      this.projectionBindFrame = 0
      this.bindProjection()
    })
  }

  private scheduleProjection(): void {
    if (!this.viewReady || this.destroyed) return
    if (!this.projectionScrollContainer) {
      this.bindProjection()
      return
    }
    if (this.projectionFrame) return
    const ownerWindow = this.projectionWindow ?? window
    this.projectionFrame = ownerWindow.requestAnimationFrame(() => {
      this.projectionFrame = 0
      if (this.destroyed) return
      const next = this.measureMountedCards()
      if (samePositionedCards(this.cards, next)) return
      this.runInsideAngular(() => {
        this.cards = next
        this.cdr.markForCheck()
      })
      // The first projection uses an estimate. A second frame reads the
      // content-sized cards and feeds their real heights into collision layout.
      this.scheduleProjection()
    })
  }

  private measureMountedCards(): PositionedRevisionReviewCardView[] {
    const rootHost = this.readRootHost()
    const listShell = this.listShell?.nativeElement
    const scrollContainer = this.projectionScrollContainer
    if (!rootHost || !listShell || !scrollContainer || !this.filteredCards.length) {
      return []
    }

    const listRect = listShell.getBoundingClientRect()
    this.captureMountedCardHeights(listShell)
    const anchorTopByItem = new Map<string, number>()
    const markers = [
      ...(rootHost.matches(REVISION_MARK_SELECTOR) ? [rootHost] : []),
      ...Array.from(
        rootHost.querySelectorAll<HTMLElement>(REVISION_MARK_SELECTOR),
      ),
    ]

    for (const marker of markers) {
      const markerRect = marker.getBoundingClientRect()
      const blockHost = marker.closest<HTMLElement>('[data-block-id]')
      const blockRect = blockHost?.getBoundingClientRect()
      const rect = hasRenderableBox(markerRect)
        ? markerRect
        : (blockRect && hasRenderableBox(blockRect) ? blockRect : null)
      if (!rect) continue
      const anchorTop = rect.top - listRect.top
      for (const revisionId of readRevisionIds(marker)) {
        const itemId = this.itemIdByRevisionId.get(revisionId)
        if (!itemId || !this.filteredCardById.has(itemId)) continue
        const previous = anchorTopByItem.get(itemId)
        if (previous === undefined || anchorTop < previous) {
          anchorTopByItem.set(itemId, anchorTop)
        }
      }
    }

    const activeItemId = this.state?.activeItemId
    return layoutRevisionReviewCards(
      [...anchorTopByItem].flatMap(([itemId, anchorTop]) => {
        const card = this.filteredCardById.get(itemId)
        return card ? [{
          value: card,
          anchorTop,
          height: this.cardHeightById.get(itemId) ?? ESTIMATED_CARD_HEIGHT,
          anchorPinned: itemId === activeItemId,
        }] : []
      }),
      CARD_GAP,
    ).map(layout => ({...layout.value, top: layout.top}))
  }

  private readRootHost(): HTMLElement | null {
    try {
      return this.doc.root.hostElement
    } catch {
      return null
    }
  }

  private captureMountedCardHeights(listShell: HTMLElement): void {
    const cards = listShell.querySelectorAll<HTMLElement>(
      '.revision-card[data-revision-review-item-id]',
    )
    cards.forEach(card => {
      const itemId = card.dataset['revisionReviewItemId']
      const height = card.getBoundingClientRect().height
      if (itemId && Number.isFinite(height) && height > 0) {
        this.cardHeightById.set(itemId, height)
      }
    })
  }

  private unbindProjection(): void {
    const ownerWindow = this.projectionWindow ??
      (this.host.nativeElement.ownerDocument.defaultView ?? window)
    if (this.projectionFrame) ownerWindow.cancelAnimationFrame(this.projectionFrame)
    if (this.projectionBindFrame) ownerWindow.cancelAnimationFrame(this.projectionBindFrame)
    this.projectionFrame = 0
    this.projectionBindFrame = 0
    this.projectionScrollContainer?.removeEventListener(
      'scroll',
      this.onScrollOrResize,
    )
    this.projectionWindow?.removeEventListener('resize', this.onScrollOrResize)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.projectionScrollContainer = null
    this.projectionWindow = null
  }

  private readonly onScrollOrResize = (): void => {
    this.scheduleProjection()
  }

  private readonly onPanelWheel = (event: WheelEvent): void => {
    const scrollContainer = this.doc.scrollContainer
    if (!scrollContainer || !event.deltaY) return
    event.preventDefault()
    const unit = event.deltaMode === 1
      ? 16
      : (event.deltaMode === 2
        ? scrollContainer.clientHeight
        : 1)
    scrollContainer.scrollTop += event.deltaY * unit
  }

  private runOutsideAngular(callback: () => void): void {
    const zone = this.doc.ngZone
    if (zone) {
      zone.runOutsideAngular(callback)
      return
    }
    callback()
  }

  private runInsideAngular(callback: () => void): void {
    const zone = this.doc.ngZone
    if (zone) {
      zone.run(callback)
      return
    }
    callback()
  }
}

function hasRenderableBox(rect: DOMRect): boolean {
  return Number.isFinite(rect.top) && (rect.width > 0 || rect.height > 0)
}

function samePositionedCards(
  current: readonly PositionedRevisionReviewCardView[],
  next: readonly PositionedRevisionReviewCardView[],
): boolean {
  if (current.length !== next.length) return false
  return current.every((card, index) => {
    const candidate = next[index]
    return candidate?.item.id === card.item.id &&
      Math.abs(candidate.top - card.top) < .1
  })
}

function summarizeKinds(item: RevisionReviewItem): string {
  const kinds = new Set(item.kinds)
  if (kinds.has('text-insert') && kinds.has('text-delete')) {
    return '替换文字'
  }
  const labels = item.kinds.map(revisionKindLabel)
  return [...new Set(labels)].join('、')
}

function revisionKindLabel(kind: RevisionReviewContentSegment['kind']): string {
  return {
    'text-insert': '新增文字',
    'text-delete': '删除文字',
    'block-insert': '新增内容块',
    'block-delete': '删除内容块',
    'block-split': '拆分段落',
    'block-merge': '合并段落',
  }[kind]
}

function statusLabel(status: RevisionReviewItem['status']): string {
  return {
    pending: '待审',
    accepted: '已接收',
    rejected: '已拒绝',
    conflict: '审批冲突',
  }[status]
}

function readItemRevisionContent(
  review: RevisionReviewPlugin,
  item: RevisionReviewItem,
): readonly RevisionReviewContentSegment[] {
  let segments: readonly RevisionReviewContentSegment[] = []
  try {
    segments = review.readContent(item.id)
  } catch {
    // Concurrent removal is represented by the stable review item metadata.
  }
  return segments
}

function summarizeRevisionContent(
  segments: readonly RevisionReviewContentSegment[],
  item: RevisionReviewItem,
): string {
  const inserted = joinRevisionText(segments, 'text-insert')
  const deleted = joinRevisionText(segments, 'text-delete')
  const source = inserted && deleted
    ? `“${deleted}” → “${inserted}”`
    : segments.map(segment => normalizeRevisionText(segment.text))
      .filter(Boolean)
      .join(' · ')
  const fallback = item.kinds.some(kind =>
    kind === 'block-split' || kind === 'block-merge')
    ? '段落边界'
    : '无文字内容'
  return clipRevisionText(source || fallback)
}

function revisionSegmentText(
  segment: RevisionReviewContentSegment,
  item: RevisionReviewItem,
): string {
  const text = normalizeRevisionText(segment.text)
  if (text) return clipRevisionText(text)
  return item.kinds.some(kind => kind === 'block-split' || kind === 'block-merge')
    ? '段落边界'
    : '无文字内容'
}

function joinRevisionText(
  segments: readonly RevisionReviewContentSegment[],
  kind: RevisionReviewContentSegment['kind'],
): string {
  return segments
    .filter(segment => segment.kind === kind)
    .map(segment => normalizeRevisionText(segment.text))
    .filter(Boolean)
    .join('')
}

function normalizeRevisionText(value: string): string {
  return value.replace(/\r?\n/g, ' ↵ ').replace(/\s+/g, ' ').trim()
}

function clipRevisionText(value: string): string {
  return value.length > REVISION_TEXT_LENGTH
    ? `${value.slice(0, REVISION_TEXT_LENGTH)}…`
    : value
}
