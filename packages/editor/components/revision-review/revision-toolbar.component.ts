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
import type {RevisionStateSnapshot} from '../../framework/revision'
import {skip, Subscription} from 'rxjs'
import {RevisionToolbarIntent} from './revision-review.types'

@Component({
  selector: 'bc-revision-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state; as state) {
      <div class="revision-toolbar" role="toolbar" aria-label="修订模式">
        <button
          type="button"
          class="revision-toolbar__button"
          [class.is-active]="state.mode === 'track'"
          (click)="intent.emit({type: 'set-mode', mode: state.mode === 'track' ? 'off' : 'track'})"
        >
          <i class="bc_icon bc_xiuding" aria-hidden="true"></i>
          {{ state.mode === 'track' ? '修订中' : '修订模式' }}
        </button>
        <span class="revision-toolbar__divider" aria-hidden="true"></span>
        <button
          type="button"
          class="revision-toolbar__button"
          [class.is-active]="state.viewMode === 'markup'"
          (click)="intent.emit({type: 'set-view-mode', viewMode: 'markup'})"
        >
          <i class="bc_icon bc_xianshipizhu" aria-hidden="true"></i>
          显示标记
        </button>
        <button
          type="button"
          class="revision-toolbar__button"
          [class.is-active]="state.viewMode === 'final'"
          (click)="intent.emit({type: 'set-view-mode', viewMode: 'final'})"
        >
          <i class="bc_icon bc_eye-open" aria-hidden="true"></i>
          最终
        </button>
        @if (state.conflicts.length) {
          <span class="revision-toolbar__conflict" role="status">
            {{ state.conflicts.length }} 个冲突
          </span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .revision-toolbar { display: flex; align-items: center; min-height: 40px; gap: 4px; }
    .revision-toolbar__button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 1px solid transparent; border-radius: 6px; color: var(--bc-color-light); background: transparent; cursor: pointer; font: inherit; }
    .revision-toolbar__button:hover { background: var(--bc-bg-hover); }
    .revision-toolbar__button.is-active { border-color: var(--bc-active-color-lighter); color: var(--bc-active-color); background: var(--bc-active-color-lighter); }
    .revision-toolbar__divider { width: 1px; height: 20px; margin: 0 4px; background: var(--bc-border-color); }
    .revision-toolbar__conflict { margin-inline-start: auto; padding: 3px 8px; border-radius: 999px; color: var(--bc-revision-conflict-color); background: var(--bc-revision-conflict-bg); font-size: 12px; }
  `],
})
export class RevisionToolbarComponent implements OnChanges, OnDestroy {
  @Input({required: true}) doc!: BlockCraftDoc
  @Output() readonly intent = new EventEmitter<RevisionToolbarIntent>()

  state: RevisionStateSnapshot | null = null
  private stateSubscription = Subscription.EMPTY

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.stateSubscription.unsubscribe()
    this.state = this.doc.revisions.state$.value
    this.stateSubscription = this.doc.revisions.state$.pipe(skip(1)).subscribe(state => {
      this.state = state
      this.cdr.detectChanges()
    })
  }

  ngOnDestroy(): void {
    this.stateSubscription.unsubscribe()
  }
}
