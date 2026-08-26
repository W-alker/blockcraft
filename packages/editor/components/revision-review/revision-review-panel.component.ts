import {DatePipe} from '@angular/common'
import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
} from '@angular/core'
import type {BlockCraftDoc} from '../../framework/doc'
import type {ResolvedRevision, RevisionStateSnapshot} from '../../framework/revision'
import {skip, Subscription} from 'rxjs'
import {RevisionReviewIntent} from './revision-review.types'

interface RevisionCardGroup {
  groupId: string
  actorName: string
  createdAt: string
  status: ResolvedRevision['status']
  label: string
  revisions: ResolvedRevision[]
}

@Component({
  selector: 'bc-revision-review-panel',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state; as state) {
      <aside class="revision-panel" aria-label="修订评审">
        <header class="revision-panel__header">
          <div>
            <h2>修订</h2>
            <p>{{ state.revisions.length }} 条记录 · epoch {{ state.epoch }}</p>
          </div>
          <span class="revision-panel__pending">
            {{ pendingCount(state.revisions) }} 待审
          </span>
        </header>

        @if (pendingCount(state.revisions); as pending) {
          @if (pending > 0) {
            <div class="revision-panel__batch" aria-label="批量审批">
              <button type="button" class="is-reject" (click)="intent.emit({type: 'reject-all'})">全部拒绝</button>
              <button type="button" class="is-accept" (click)="intent.emit({type: 'accept-all'})">全部接受</button>
            </div>
          }
        }

        @if (state.conflicts.length) {
          <section class="revision-panel__conflicts" aria-label="结构冲突">
            <strong>需要处理的结构冲突</strong>
            <p>冲突不会自动选胜者。选择一侧，或先拒绝双方再手工编辑。</p>
            @for (conflict of state.conflicts; track conflict.id) {
              <div class="revision-conflict-card">
                <span>{{ conflict.blockIds.length }} 个受影响块</span>
                <div>
                  <button type="button" (click)="keep(conflict.id, conflict.revisionIds, 0)">保留前者</button>
                  <button type="button" (click)="keep(conflict.id, conflict.revisionIds, 1)">保留后者</button>
                </div>
              </div>
            }
          </section>
        }

        <div class="revision-panel__cards">
          @for (group of groups(state.revisions); track group.groupId) {
            <article
              class="revision-card"
              [attr.data-status]="group.status"
              (click)="navigate(group.revisions[0].id)"
            >
              <div class="revision-card__meta">
                <span class="revision-card__avatar" aria-hidden="true">
                  {{ group.actorName.slice(0, 1) }}
                </span>
                <div>
                  <strong>{{ group.actorName }}</strong>
                  <time>{{ group.createdAt | date:'MM-dd HH:mm' }}</time>
                </div>
                <span class="revision-card__state">{{ statusLabel(group.status) }}</span>
              </div>
              <p class="revision-card__summary">{{ group.label }}</p>
              <small>{{ group.revisions.length }} 个原子操作</small>
              <footer (click)="$event.stopPropagation()">
                @if (group.status === 'conflict') {
                  <button type="button" class="is-reject" (click)="redecideGroup(group, 'reject')">重新拒绝</button>
                  <button type="button" class="is-accept" (click)="redecideGroup(group, 'accept')">重新接受</button>
                } @else {
                  <button type="button" class="is-reject" (click)="intent.emit({type: 'reject-group', groupId: group.groupId})">
                    <i class="bc_icon bc_x-01" aria-hidden="true"></i>拒绝
                  </button>
                  <button type="button" class="is-accept" (click)="intent.emit({type: 'accept-group', groupId: group.groupId})">
                    <i class="bc_icon bc_check-ok" aria-hidden="true"></i>接受
                  </button>
                }
              </footer>
            </article>
          } @empty {
            <div class="revision-panel__empty">
              <i class="bc_icon bc_xiuding-2" aria-hidden="true"></i>
              <p>暂无修订</p>
              <span>开启修订模式后，编辑会出现在这里。</span>
            </div>
          }
        </div>
      </aside>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; height: 100%; }
    .revision-panel { box-sizing: border-box; height: 100%; overflow: auto; padding: 18px 14px 28px; color: var(--bc-color); background: var(--bc-bg-secondary); border-inline-start: 1px solid var(--bc-border-color); }
    .revision-panel__header { display: flex; align-items: flex-start; justify-content: space-between; padding: 0 4px 14px; }
    h2 { margin: 0; font-size: 16px; }
    .revision-panel__header p { margin: 4px 0 0; color: var(--bc-color-light); font-size: 11px; }
    .revision-panel__pending { padding: 3px 8px; border-radius: 999px; color: var(--bc-active-color); background: var(--bc-active-color-lighter); font-size: 11px; }
    .revision-panel__batch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: -4px 4px 12px; }
    .revision-panel__batch button { min-height: 28px; border: 1px solid var(--bc-border-color); border-radius: 6px; background: transparent; cursor: pointer; font: inherit; font-size: 11px; }
    .revision-panel__batch .is-reject { color: var(--bc-revision-delete-color); }
    .revision-panel__batch .is-accept { color: var(--bc-revision-insert-color); }
    .revision-panel__conflicts { margin-bottom: 12px; padding: 12px; border: 1px solid var(--bc-revision-conflict-color); border-radius: 10px; background: var(--bc-revision-conflict-bg); }
    .revision-panel__conflicts strong { font-size: 13px; }
    .revision-panel__conflicts p { margin: 5px 0 10px; color: var(--bc-color-light); font-size: 11px; line-height: 1.5; }
    .revision-conflict-card { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--bc-revision-conflict-color) 28%, transparent); font-size: 11px; }
    .revision-conflict-card button { margin-inline-start: 4px; border: 0; color: var(--bc-revision-conflict-color); background: transparent; cursor: pointer; }
    .revision-panel__cards { display: grid; gap: 10px; }
    .revision-card { padding: 12px; border: 1px solid var(--bc-border-color); border-radius: 10px; background: var(--bc-bg-elevated); box-shadow: var(--bc-shadow-sm); cursor: pointer; }
    .revision-card[data-status="conflict"] { border-color: var(--bc-revision-conflict-color); }
    .revision-card__meta { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 8px; }
    .revision-card__avatar { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: white; background: var(--bc-active-color); font-size: 12px; }
    .revision-card__meta strong, .revision-card__meta time { display: block; }
    .revision-card__meta strong { font-size: 12px; }
    .revision-card__meta time { margin-top: 2px; color: var(--bc-color-lighter); font-size: 10px; }
    .revision-card__state { color: var(--bc-color-light); font-size: 10px; }
    .revision-card__summary { margin: 10px 0 4px; font-size: 13px; line-height: 1.5; }
    .revision-card small { color: var(--bc-color-lighter); }
    .revision-card footer { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .revision-card footer button { min-height: 30px; border: 1px solid var(--bc-border-color); border-radius: 6px; background: transparent; cursor: pointer; font: inherit; font-size: 12px; }
    .revision-card footer button i { margin-inline-end: 4px; }
    .revision-card footer .is-reject { color: var(--bc-revision-delete-color); }
    .revision-card footer .is-accept { color: var(--bc-revision-insert-color); }
    .revision-panel__empty { display: grid; place-items: center; padding: 64px 16px; color: var(--bc-color-lighter); text-align: center; }
    .revision-panel__empty i { font-size: 24px; }
    .revision-panel__empty p { margin: 10px 0 4px; color: var(--bc-color-light); }
    .revision-panel__empty span { font-size: 11px; }
  `],
})
export class RevisionReviewPanelComponent implements OnChanges, OnDestroy {
  @Input({required: true}) doc!: BlockCraftDoc
  @Output() readonly intent = new EventEmitter<RevisionReviewIntent>()

  state: RevisionStateSnapshot | null = null
  private stateSubscription = Subscription.EMPTY
  private groupedSource: readonly ResolvedRevision[] | null = null
  private groupedResult: RevisionCardGroup[] = []

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.stateSubscription.unsubscribe()
    this.state = this.doc.revisions.state$.value
    this.groupedSource = null
    this.stateSubscription = this.doc.revisions.state$.pipe(skip(1)).subscribe(state => {
      this.state = state
      this.cdr.detectChanges()
    })
  }

  ngOnDestroy(): void {
    this.stateSubscription.unsubscribe()
  }

  groups(revisions: readonly ResolvedRevision[]): RevisionCardGroup[] {
    if (this.groupedSource === revisions) return this.groupedResult
    const groups = new Map<string, ResolvedRevision[]>()
    revisions.forEach(revision => {
      const list = groups.get(revision.groupId) ?? []
      list.push(revision)
      groups.set(revision.groupId, list)
    })
    this.groupedSource = revisions
    this.groupedResult = [...groups.entries()].map(([groupId, records]) => ({
      groupId,
      actorName: records[0].actor.displayName || records[0].actor.actorId,
      createdAt: records[0].createdAt,
      status: mergeGroupStatus(records),
      label: summarizeGroup(records),
      revisions: records,
    })).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return this.groupedResult
  }

  pendingCount(revisions: readonly ResolvedRevision[]): number {
    return revisions.filter(revision => revision.status === 'pending').length
  }

  statusLabel(status: ResolvedRevision['status']): string {
    return {pending: '待审', accepted: '已接受', rejected: '已拒绝', conflict: '审批冲突'}[status]
  }

  navigate(revisionId: string): void {
    this.intent.emit({type: 'navigate', revisionId})
  }

  keep(conflictId: string, revisionIds: string[], index: number): void {
    const keepRevisionId = revisionIds[index]
    if (!keepRevisionId) return
    this.intent.emit({type: 'resolve-overlap', conflictId, keepRevisionIds: [keepRevisionId]})
  }

  redecideGroup(group: RevisionCardGroup, action: 'accept' | 'reject'): void {
    group.revisions.forEach(revision => {
      this.intent.emit({type: 'redecide', revisionId: revision.id, action})
    })
  }
}

function mergeGroupStatus(revisions: readonly ResolvedRevision[]): ResolvedRevision['status'] {
  const statuses = new Set(revisions.map(revision => revision.status))
  if (statuses.has('conflict') || statuses.size > 1) return 'conflict'
  return revisions[0].status
}

function summarizeGroup(revisions: readonly ResolvedRevision[]): string {
  const labels: Record<ResolvedRevision['kind'], string> = {
    'text-insert': '插入文字',
    'text-delete': '删除文字',
    'block-insert': '新增内容块',
    'block-delete': '删除内容块',
    'block-split': '拆分段落',
    'block-merge': '合并段落',
  }
  const distinct = [...new Set(revisions.map(revision => labels[revision.kind]))]
  return distinct.join('、')
}
