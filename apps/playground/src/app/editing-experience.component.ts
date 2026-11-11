import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject} from '@angular/core'
import {BlockCraftDoc} from '@ccc/blockcraft'
import {Subscription} from 'rxjs'
import {EDITING_EXPERIENCES, experienceConfig, matchingExperience} from './editing-experience'

@Component({
  selector: 'playground-editing-experience', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="experience" [class.is-dragging]="dragging" [class.is-disabled]="disabled" [class.is-custom]="custom"
      [style.--position]="position * 25 + '%'" data-testid="editing-experience">
      <div class="heading"><span>编辑体验</span><span>{{ dragging ? '松手切换' : custom ? '已自定义' : '五档可调' }}</span></div>
      <div class="current"><strong>{{ level.label }}</strong><span class="ordinal">0{{ index + 1 }}<span> / 05</span></span></div>
      <div class="slider-shell">
        <div class="rail" aria-hidden="true">
          <div class="rail-fill"></div>
          @for (item of levels; track item.label; let i = $index) {
            <span class="detent" [class.reached]="i <= position" [style.left.%]="i * 25"></span>
          }
          <div class="thumb"></div>
          <span class="drag-label">{{ level.label }}</span>
        </div>
        <div #range class="slider-input" role="slider" aria-valuemin="1" aria-valuemax="5" aria-orientation="horizontal"
          [attr.aria-valuenow]="index + 1" [attr.aria-disabled]="disabled" [tabIndex]="disabled ? -1 : 0" aria-label="编辑体验档位"
          [attr.aria-valuetext]="level.label + (custom && !dragging ? '，自定义配置' : '')"
          aria-describedby="editing-experience-description"
          (keydown)="onKey($event)"></div>
      </div>
      <div class="stops" aria-label="选择编辑体验">
        @for (item of levels; track item.label; let i = $index) {
          <button type="button" [disabled]="disabled" [attr.aria-label]="item.label" [attr.aria-pressed]="!custom && index === i"
            [class.active]="index === i" (mousedown)="$event.preventDefault()" (click)="choose(i)">{{ item.shortLabel }}</button>
        }
      </div>
      <p class="description" id="editing-experience-description">{{ description }}</p>
      <div class="endpoints"><span>内容优先</span><span>设计优先</span></div>
      @if (notice) { <p class="notice" role="status">{{ notice }}</p> }
    </div>
  `,
  styleUrl: './editing-experience.component.scss',
})
export class EditingExperienceComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() doc: BlockCraftDoc | null = null
  @ViewChild('range', {static: true}) range!: ElementRef<HTMLDivElement>
  readonly levels = EDITING_EXPERIENCES
  private readonly zone = inject(NgZone)
  private readonly cdr = inject(ChangeDetectorRef)
  private subscriptions = new Subscription()
  private cleanup: (() => void) | undefined
  private pointer: {id: number; left: number; width: number} | null = null
  private frame = 0
  private pendingPosition = 2
  position = 2
  custom = false
  dragging = false
  notice = ''
  get index() { return Math.round(this.position) }
  get level() { return this.levels[this.index]! }
  get disabled() { return !this.doc?.isInitialized || this.doc.isReadonly }
  get description() {
    if (!this.doc?.isInitialized) return '初始化文档，选择适合此刻的编辑体验。'
    if (this.doc.isReadonly) return '当前为只读，恢复编辑后可调整。'
    if (this.custom && !this.dragging) return '当前使用自定义交互；选择档位会替换这些设置。'
    return this.level.description
  }

  ngOnChanges(): void {
    this.subscriptions.unsubscribe()
    this.subscriptions = new Subscription()
    if (!this.doc) { this.cancel(); return }
    const refresh = () => this.zone.run(() => { this.cancel(); this.sync(); this.cdr.markForCheck() })
    this.subscriptions.add(this.doc.interaction.policyChanges$.subscribe(refresh))
    this.subscriptions.add(this.doc.readonlySwitch$.subscribe(refresh))
    this.subscriptions.add(this.doc.afterInit$.subscribe(refresh))
  }
  private sync(): void {
    if (!this.doc) return
    const match = matchingExperience(this.doc)
    this.custom = match < 0
    this.position = match >= 0 ? match : ({immersive: 0, mixed: 2, design: 4}[this.doc.interaction.value])
  }
  choose(index: number): void {
    if (this.disabled) return
    this.cancel()
    const applied = this.doc!.interaction.configure(experienceConfig(this.doc!, Math.max(0, Math.min(4, index))))
    this.notice = applied ? '' : '请先结束当前输入或拖动，再切换档位。'
    this.sync()
    this.cdr.markForCheck()
  }
  onKey(event: KeyboardEvent): void {
    const keys: Record<string, number> = {ArrowLeft: this.index - 1, ArrowDown: this.index - 1,
      ArrowRight: this.index + 1, ArrowUp: this.index + 1, Home: 0, End: 4, PageDown: this.index - 1, PageUp: this.index + 1}
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); this.sync(); return }
    if (Object.hasOwn(keys, event.key)) { event.preventDefault(); this.choose(keys[event.key]!) }
  }

  ngAfterViewInit(): void {
    const input = this.range.nativeElement, view = input.ownerDocument.defaultView!
    const down = (event: PointerEvent) => {
      if (this.disabled || event.button !== 0 || !event.isPrimary || this.pointer) return
      // Own the gesture end-to-end; a native range must not independently commit a change.
      event.preventDefault() // Keep the editor's text focus.
      const rect = input.getBoundingClientRect() // Once per gesture, never on pointermove.
      this.pointer = {id: event.pointerId, left: rect.left + 14, width: Math.max(1, rect.width - 28)}
      input.setPointerCapture(event.pointerId)
      this.zone.run(() => { this.dragging = true; this.notice = ''; this.preview(event.clientX); this.cdr.markForCheck() })
    }
    const move = (event: PointerEvent) => {
      if (this.pointer?.id !== event.pointerId) return
      this.pendingPosition = this.positionAt(event.clientX)
      if (!this.frame) this.frame = view.requestAnimationFrame(() => {
        this.frame = 0
        if (!this.pointer || this.position === this.pendingPosition) return
        this.zone.run(() => { this.position = this.pendingPosition; this.cdr.markForCheck() })
      })
    }
    const up = (event: PointerEvent) => {
      if (this.pointer?.id !== event.pointerId) return
      const index = Math.round(this.positionAt(event.clientX))
      this.zone.run(() => this.choose(index))
    }
    // Normal capture release follows a successful commit; only cancel a live gesture.
    const cancel = () => {
      if (!this.pointer) return
      this.zone.run(() => { this.cancel(); this.sync(); this.cdr.markForCheck() })
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !this.pointer) return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    this.zone.runOutsideAngular(() => {
      input.addEventListener('pointerdown', down)
      input.addEventListener('pointermove', move)
      input.addEventListener('pointerup', up)
      input.addEventListener('pointercancel', cancel)
      input.addEventListener('lostpointercapture', cancel)
      view.addEventListener('blur', cancel)
      view.addEventListener('resize', cancel)
      view.addEventListener('keydown', escape, true)
    })
    this.cleanup = () => {
      input.removeEventListener('pointerdown', down); input.removeEventListener('pointermove', move)
      input.removeEventListener('pointerup', up); input.removeEventListener('pointercancel', cancel)
      input.removeEventListener('lostpointercapture', cancel)
      view.removeEventListener('blur', cancel); view.removeEventListener('resize', cancel)
      view.removeEventListener('keydown', escape, true)
    }
  }
  private positionAt(x: number): number { return Math.round(Math.max(0, Math.min(4, (x - this.pointer!.left) / this.pointer!.width * 4))) }
  private preview(x: number): void { this.position = this.positionAt(x) }
  private cancel(): void {
    const input = this.range?.nativeElement
    if (this.frame) input?.ownerDocument.defaultView?.cancelAnimationFrame(this.frame)
    this.frame = 0
    const pointer = this.pointer
    this.pointer = null
    this.dragging = false
    if (pointer && input?.hasPointerCapture(pointer.id)) input.releasePointerCapture(pointer.id)
  }
  ngOnDestroy(): void { this.cleanup?.(); this.cancel(); this.subscriptions.unsubscribe() }
}
