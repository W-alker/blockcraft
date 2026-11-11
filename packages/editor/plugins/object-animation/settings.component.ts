import {Subscription} from 'rxjs';
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, OnInit, OnDestroy} from '@angular/core';
import {CsButtonComponent, CsInputNumberComponent, CsOptionComponent, CsSelectComponent} from '@cses/ui';
import {OBJECT_ANIMATION_EFFECTS, normalizeObjectAnimation, type ObjectAnimationConfig} from '../../framework/modules/object/animation/config';

@Component({
  selector: 'bc-object-animation-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsButtonComponent, CsInputNumberComponent, CsSelectComponent, CsOptionComponent],
  template: `
    <section [class.embedded]="embedded" role="dialog" aria-label="块动画设置">
      <header><strong>动画</strong><button cs-button csType="text" csSize="sm" aria-label="关闭动画设置" (click)="dismiss.emit()"><i class="bc_icon bc_guanbi"></i></button></header>
      @if (mixed) { <p>多个动画效果</p> }
      <div class="categories" role="group" aria-label="动画分类">
        <button cs-button csType="text" [class.active]="category === 'entrance'" [attr.aria-pressed]="category === 'entrance'" (click)="category = 'entrance'">进入</button>
        <button cs-button csType="text" [class.active]="category === 'emphasis'" [attr.aria-pressed]="category === 'emphasis'" (click)="category = 'emphasis'">强调</button>
      </div>
      <div class="effects" role="group" aria-label="动画效果">
        <button cs-button csType="text" [class.active]="!config && !mixed" [attr.aria-pressed]="!config && !mixed" (click)="choose(null)">无</button>
        @for (effect of visibleEffects; track effect.value) {
          <button cs-button csType="text" [class.active]="config?.effect === effect.value && !mixed"
            [attr.aria-pressed]="config?.effect === effect.value && !mixed" (click)="choose(effect.value)">{{effect.label}}</button>
        }
      </div>
      @if (config && !mixed) {
        @if (config.effect === 'slide') {
          <label>方向<cs-select csSize="sm" [csValue]="config.direction" (csValueChange)="patch({direction: $any($event)})">
            <cs-option csValue="up" csLabel="向上"/><cs-option csValue="down" csLabel="向下"/>
            <cs-option csValue="left" csLabel="向左"/><cs-option csValue="right" csLabel="向右"/>
          </cs-select></label>
        }
        <label>时长（秒）<cs-input-number aria-label="动画时长" csSize="sm" [csMin]="0.1" [csMax]="10" [csStep]="0.1" [csPrecision]="1"
          [csValue]="config.duration / 1000" (csValueChange)="numberChange('duration', $event)"/></label>
        <label>延迟（秒）<cs-input-number aria-label="动画延迟" csSize="sm" [csMin]="0" [csMax]="10" [csStep]="0.1" [csPrecision]="1"
          [csValue]="config.delay / 1000" (csValueChange)="numberChange('delay', $event)"/></label>
        <label>重复<cs-select aria-label="动画重复" csSize="sm" [csValue]="repeatMode" (csValueChange)="setRepeatMode($any($event))">
          <cs-option csValue="once" csLabel="单次"/><cs-option csValue="count" csLabel="指定次数"/>
          <cs-option csValue="infinite" csLabel="持续循环"/>
        </cs-select></label>
        @if (repeatMode === 'count' && config.iterations !== 'infinite') {
          <label>播放次数<div class="iteration-count"><cs-input-number aria-label="播放次数" csSize="sm" [csMin]="2" [csMax]="10" [csStep]="1" [csPrecision]="0"
            [csValue]="config.iterations" (csValueChange)="iterationsChange($event)"/><span>次</span></div></label>
        }
        <label>速度曲线<cs-select csSize="sm" [csValue]="config.easing" (csValueChange)="patch({easing: $any($event)})">
          <cs-option csValue="ease-out" csLabel="平滑减速"/><cs-option csValue="ease-in-out" csLabel="平滑加减速"/>
          <cs-option csValue="linear" csLabel="匀速"/>
          @if (!['ease-out', 'ease-in-out', 'linear'].includes(config.easing)) { <cs-option [csValue]="config.easing" [csLabel]="config.easing"/> }
        </cs-select></label>
      }
      @if (doc.objectAnimation.reducedMotion) { <p>系统已开启“减少动态效果”，动画将保持静止。</p> }
      <footer>
        <button cs-button csType="text" csSize="sm" [disabled]="(!config && !mixed) || doc.objectAnimation.reducedMotion" (click)="preview()">预览</button>
        <button cs-button csType="primary" csSize="sm" [disabled]="!writableIds.length || doc.isReadonly" (click)="confirm()">确定</button>
      </footer>
    </section>
  `,
  styles: [`
    :host {display:block;width:100%;max-width:calc(100vw - 24px);color:var(--bc-float-toolbar-item-color);font-size:var(--bc-fs-sm);}
    section {padding:16px;border-radius:12px;background:var(--bc-float-toolbar-bg);box-shadow:var(--bc-float-toolbar-shadow);border:1px solid var(--bc-float-toolbar-divider-color);max-height:calc(100vh - 32px);overflow:auto;}
    section.embedded {padding:0;border:0;box-shadow:none;max-height:none;overflow:visible;}
    header,footer {display:flex;align-items:center;gap:8px;} header {justify-content:space-between;} footer {margin-top:16px;justify-content:flex-end;}
    p {color:var(--bc-color-light);font-size:inherit;line-height:1.5;margin:8px 0 12px;}
    .effects {display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px;}
    .effects button {border:1px solid var(--bc-float-toolbar-divider-color);}
    .effects button.active {color:var(--bc-active-color);background:var(--bc-float-toolbar-item-active-bg);border-color:var(--bc-active-color);}
    label {display:grid;grid-template-columns:1fr 128px;align-items:center;gap:8px;margin-top:12px;}
    .categories {display:flex;gap:6px;margin:8px 0 10px;}
    .categories button {flex:1;}
    .categories button.active {color:var(--bc-active-color);background:var(--bc-float-toolbar-item-active-bg);}
    .iteration-count {display:flex;align-items:center;gap:8px;}
    cs-input-number,cs-select {width:100%;min-width:0;}
    @media print {:host {display:none;}}
  `],
})
export class ObjectAnimationSettingsComponent implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  private releaseEditing?: () => void;
  ngOnInit(): void {
    this.releaseEditing = this.doc.objectAnimation.acquireEditingLease(this.blockIds);
    this.refresh();
    this.subscriptions.add(this.doc.model.contentChange$.subscribe(change => {
      if (!this.dirty && change.blockIds.some(id => this.blockIds.includes(id))) this.refresh();
    }));
  }
  ngOnDestroy(): void { this.cancelScheduledPreview(); this.subscriptions.unsubscribe(); if (!this.doc.isReadonly) this.doc.objectAnimation.stopPreview(); this.releaseEditing?.(); }
  @Input({required: true}) doc!: BlockCraft.Doc;
  @Input({required: true}) blockIds: readonly string[] = [];
  @Input() embedded = false;
  @Output() readonly dismiss = new EventEmitter<'confirm' | undefined>();
  readonly effects = OBJECT_ANIMATION_EFFECTS;
  private dirty = false;
  private finiteIterations = 2;
  category: 'entrance' | 'emphasis' = 'entrance';
  get visibleEffects() { return this.effects.filter(effect => effect.category === this.category); }
  get repeatMode(): 'once' | 'count' | 'infinite' {
    return this.config?.iterations === 'infinite' ? 'infinite' : (this.config?.iterations ?? 1) > 1 ? 'count' : 'once';
  }
  private previewTimer?: ReturnType<typeof setTimeout>;
  config: ObjectAnimationConfig | null = null;
  mixed = false;
  constructor(private readonly cdr: ChangeDetectorRef) {}

  get writableIds(): string[] {
    return this.blockIds.filter(id => this.doc.model.exists(id) && !this.doc.readonlyManager.isReadonly(id));
  }

  refresh(): void {
    const configs = this.writableIds.map(id => this.doc.objectAnimation.read(id));
    this.config = configs[0] ?? null;
    this.finiteIterations = typeof this.config?.iterations === 'number' ? Math.max(2, this.config.iterations) : 2;
    this.category = this.effects.find(effect => effect.value === this.config?.effect)?.category ?? 'entrance';
    this.mixed = configs.some(config => JSON.stringify(config) !== JSON.stringify(this.config));
    this.cdr.markForCheck();
  }
  choose(effect: ObjectAnimationConfig['effect'] | null): void {
    this.setDraft(effect ? normalizeObjectAnimation({...this.config, effect}) : null);
  }
  patch(patch: Partial<ObjectAnimationConfig>): void {
    if (this.config) this.setDraft({...this.config, ...patch});
  }
  numberChange(key: 'duration' | 'delay', value: number | null): void {
    if (value !== null) this.patch({[key]: value * 1000});
  }
  setRepeatMode(mode: 'once' | 'count' | 'infinite'): void {
    if (!this.config || !['once', 'count', 'infinite'].includes(mode)) return;
    if (typeof this.config.iterations === 'number' && this.config.iterations > 1) this.finiteIterations = this.config.iterations;
    this.patch({iterations: mode === 'infinite' ? 'infinite' : mode === 'once' ? 1 : this.finiteIterations});
  }
  iterationsChange(value: number | null): void {
    if (value !== null) this.patch({iterations: Math.max(2, value)});
  }
  preview(): void {
    this.cancelScheduledPreview();
    this.doc.objectAnimation.preview(this.writableIds, this.mixed ? undefined : this.config);
  }
  confirm(): void {
    if (this.doc.isReadonly || !this.writableIds.length) return;
    this.cancelScheduledPreview();
    this.doc.objectAnimation.stopPreview();
    if (this.dirty) this.doc.objectAnimation.update(this.writableIds, this.config);
    this.dismiss.emit('confirm');
  }
  private setDraft(config: ObjectAnimationConfig | null): void {
    this.cancelScheduledPreview();
    this.doc.objectAnimation.stopPreview();
    this.config = normalizeObjectAnimation(config);
    this.mixed = false;
    this.dirty = true;
    if (this.config) {
      this.doc.ngZone.runOutsideAngular(() => {
        this.previewTimer = setTimeout(() => {
          this.previewTimer = undefined;
          this.preview();
        }, 180);
      });
    }
    this.cdr.markForCheck();
  }
  private cancelScheduledPreview(): void {
    if (this.previewTimer !== undefined) clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
  }
}
