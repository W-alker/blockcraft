import {DatePipe} from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'
import type {RevisionViewMode} from '../../framework/revision'
import type {RevisionReviewItem} from '../../plugins/revision-review'
import type {RevisionReviewPopoverIntent} from './revision-review.types'

@Component({
  selector: 'bc-revision-review-popover',
  standalone: true,
  imports: [DatePipe, CsTooltipDirective],
  templateUrl: './revision-review-popover.component.html',
  styleUrl: './revision-review-popover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionReviewPopoverComponent {
  readonly item = input.required<RevisionReviewItem>()
  readonly activeIndex = input(0)
  readonly total = input(0)
  readonly viewMode = input<RevisionViewMode>('markup')
  /** Host-owned authorization snapshot. The component never derives roles. */
  readonly canReview = input(true)
  readonly intent = output<RevisionReviewPopoverIntent>()

  protected readonly actor = computed(() => this.item().actors[0] ?? {
    actorId: 'unknown',
    displayName: '未知协作者',
  })
  protected readonly actorName = computed(() =>
    this.actor().displayName || this.actor().actorId)
  protected readonly actorInitial = computed(() =>
    Array.from(this.actorName().trim())[0] ?? '?')
  protected readonly hasStructuralConflict = computed(() =>
    this.item().overlapConflictIds.length > 0)
  protected readonly readonlyReason = computed(() => {
    if (this.viewMode() === 'final') return '最终视图只读；切回“显示标记”后可继续裁决。'
    if (!this.canReview()) return '当前宿主未允许执行修订裁决。'
    if (this.hasStructuralConflict()) return '该修订存在结构冲突，请在总体面板中选择要接收的一侧。'
    return null
  })
  protected readonly keepDisabled = computed(() =>
    !!this.readonlyReason() || this.item().status === 'accepted')
  protected readonly revertDisabled = computed(() =>
    !!this.readonlyReason() || this.item().status === 'rejected')
  protected readonly keepLabel = computed(() =>
    this.item().status === 'rejected' ? '改为接收修订' : '接收修订')
  protected readonly revertLabel = computed(() =>
    this.item().status === 'accepted' ? '改为拒绝修订' : '拒绝修订')

  protected emit(type: RevisionReviewPopoverIntent['type']): void {
    if (type === 'keep' || type === 'revert') {
      this.intent.emit({type, itemId: this.item().id})
      return
    }
    this.intent.emit({type})
  }
}
