import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, Input, NgZone, OnInit, Output, ViewChild, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {auditTime, merge} from 'rxjs';
import {CsButtonComponent, CsTooltipDirective} from '@cses/ui';
import {BLOCK_OBJECT_LAYOUT_OPTIONS, type BlockObjectLayout} from '../../framework';
import {DateCardSettingsComponent} from '../../blocks/dynamic-material-blocks/date-card/date-card-settings.component';
import {DATE_CARD_WATCHED_PROPS, type DateCardRenderComponent, type DateCardModel} from '../../blocks/dynamic-material-blocks/date-card/date-card-render.component';
import {WeatherSettingsComponent} from '../../blocks/dynamic-material-blocks/weather/weather-settings.component';
import type {WeatherBlockComponent} from '../../blocks/dynamic-material-blocks/weather/weather-render.component';
import {draftPropMetaKey, hasDraftProps, projectDraftProps} from '../../blocks/dynamic-material-blocks/draft-props';

/** 块外横向工具栏：布局、层级和已有的物料设置共享同一个浮层。 */
@Component({
  selector: 'bc-material-toolbar', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsButtonComponent, CsTooltipDirective, DateCardSettingsComponent, WeatherSettingsComponent],
  host: {'data-bc-native-input': '', '(keydown.escape)': 'onEscape($event)', '[attr.data-testid]': "block.flavour === 'weather' ? 'weather-toolbar' : 'material-toolbar'"},
  template: `
    <nav class="material-toolbar" aria-label="物料工具栏">
      @for (item of layoutOptions; track item.value) {
        <button cs-button csType="text" csSize="sm" type="button" [attr.aria-label]="item.label"
          [csTooltip]="item.label" [class.active]="objectLayout === item.value" [attr.aria-pressed]="objectLayout === item.value"
          [disabled]="!writable" (click)="setLayout(item.value)">
          <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
        </button>
      }
      @if (showsLayers) {
        <span class="material-toolbar__divider"></span>
        <button cs-button csType="text" csSize="sm" type="button" (click)="move('forward')"
          aria-label="上移一层" csTooltip="上移一层" [disabled]="!canMoveForward">
          <i class="bc_icon bc_cengji-shangyi" aria-hidden="true"></i>
        </button>
        <button cs-button csType="text" csSize="sm" type="button" (click)="move('backward')"
          aria-label="下移一层" csTooltip="下移一层" [disabled]="!canMoveBackward">
          <i class="bc_icon bc_cengji-xiayi" aria-hidden="true"></i>
        </button>
      }
      @if (weatherBlock; as weather) {
        @if (weather.canRefreshWeather) {
          <span class="material-toolbar__divider"></span>
          <button cs-button csType="text" csSize="sm" type="button" aria-label="刷新天气"
            [csTooltip]="weather.weatherStatus === 'loading' ? '刷新中…' : '刷新天气'"
            [csLoading]="weather.weatherStatus === 'loading'" [disabled]="!writable"
            (click)="weather.refreshWeather()">
            @if (weather.weatherStatus !== 'loading') { <i class="bc_icon bc_huanyige" aria-hidden="true"></i> }
          </button>
        }
      }
      @if (settingsLabel) {
        <span class="material-toolbar__divider"></span>
        <button #settingsTrigger cs-button csType="text" csSize="sm" type="button" [attr.aria-label]="settingsLabel"
          [csTooltip]="settingsLabel" [class.active]="settingsOpen" [attr.aria-expanded]="settingsOpen"
          [disabled]="!writable" (click)="settingsOpen ? closeSettings() : openSettings()">
          <i class="bc_icon bc_shezhi" aria-hidden="true"></i>
        </button>
      }
    </nav>
    @if (settingsOpen) {
      <div class="material-toolbar__settings" (keydown.escape)="closeSettings($event)">
        @if (dateBlock; as date) {
          <bc-date-card-settings [props]="dateProps" [scale]="date.contentScale"
            (apply)="applyDateSettings($event)" (cancel)="closeSettings()" />
        }
        @if (weatherBlock; as weather) {
          <bc-weather-settings [block]="weather" (apply)="closeSettings()" (cancel)="closeSettings()" />
        }
      </div>
    }
  `,
  styles: [`
    :host {display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:0;max-height:inherit;max-width:calc(100vw - 16px);color:var(--bc-float-toolbar-item-color);}
    .material-toolbar {display:flex;flex:none;align-items:center;gap:2px;padding:3px;border-radius:8px;max-width:100%;box-sizing:border-box;
      background:var(--bc-float-toolbar-bg);box-shadow:var(--bc-float-toolbar-shadow);border:1px solid var(--bc-float-toolbar-divider-color);}
    .material-toolbar button {width:28px;min-width:28px;height:28px;padding:0;color:inherit;}
    @media (any-hover:hover) {.material-toolbar button:hover:not(:disabled) {background:var(--bc-float-toolbar-item-hover-bg);}}
    .material-toolbar button:focus-visible {outline:2px solid var(--bc-active-color);outline-offset:-2px;}
    .material-toolbar button:disabled {color:var(--bc-secondary-color);}
    .material-toolbar button.active {color:var(--bc-active-color);background:var(--bc-float-toolbar-item-active-bg);}
    .material-toolbar__divider {width:1px;height:18px;flex:none;margin:0 3px;background:var(--bc-float-toolbar-divider-color);}
    .material-toolbar__divider:first-child {display:none;}
    .material-toolbar__settings {display:flex;flex-direction:column;min-height:0;max-width:100%;}
    @media print {:host {display:none;}}
  `],
})
export class MaterialToolbarComponent implements OnInit {
  @Input({required: true}) block!: BlockCraft.BlockComponent;
  @Output() readonly layoutChange = new EventEmitter<void>();
  @ViewChild('settingsTrigger', {read: ElementRef}) private settingsTrigger?: ElementRef<HTMLButtonElement>;
  settingsOpen = false;
  protected dateProps: DateCardModel['props'] = {};
  private dateDraft = false;
  protected canMoveForward = false;
  protected canMoveBackward = false;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  protected get dateBlock(): DateCardRenderComponent | null {
    return this.block.flavour === 'date-card' ? this.block as DateCardRenderComponent : null;
  }
  protected get weatherBlock(): WeatherBlockComponent | null {
    return this.block.flavour === 'weather' ? this.block as WeatherBlockComponent : null;
  }
  protected get settingsLabel(): string {
    return this.dateBlock ? '日期设置' : this.weatherBlock ? '天气样式与配色' : '';
  }
  protected get objectLayout() { return this.block.doc.placement.getObjectLayout(this.block); }
  protected get layoutOptions() {
    return BLOCK_OBJECT_LAYOUT_OPTIONS.filter(item => this.block.doc.placement.supportsObjectLayout(this.block, item.value));
  }
  protected get showsLayers(): boolean {
    const placement = this.block.doc.placement;
    return !placement.isInObjectGroup(this.block) && placement.getState(this.block).mode === 'absolute';
  }
  protected get writable(): boolean {
    const {block} = this, doc = block.doc;
    return !doc.isReadonly && doc.model.exists(block.id)
      && doc.vm.get(block.id)?.instance === block && !block.isReadonly;
  }

  ngOnInit(): void {
    const doc = this.block.doc;
    merge(doc.onChildrenUpdate$, doc.onPropsUpdate$, doc.readonlyManager.stateChange$)
      .pipe(auditTime(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.zone.run(() => { this.refresh(); this.cdr.markForCheck(); }));
    this.refresh();
  }
  private refresh(): void {
    const movable = this.writable && this.showsLayers;
    this.canMoveForward = movable && this.block.doc.placement.canMoveForward(this.block);
    this.canMoveBackward = movable && this.block.doc.placement.canMoveBackward(this.block);
  }
  protected setLayout(layout: BlockObjectLayout): void {
    const {doc} = this.block;
    if (!this.writable || !doc.placement.supportsObjectLayout(this.block, layout)) return;
    doc.crud.undoManager.stopCapturing();
    doc.placement.setObjectLayout(this.block, layout);
    doc.crud.undoManager.stopCapturing();
    this.refresh();
    this.layoutChange.emit();
  }
  protected move(direction: 'forward' | 'backward'): void {
    if (!this.writable || !this.showsLayers) return;
    const {doc} = this.block;
    if (!(direction === 'forward' ? doc.placement.canMoveForward(this.block) : doc.placement.canMoveBackward(this.block))) return;
    doc.crud.undoManager.stopCapturing();
    if (direction === 'forward') doc.placement.moveForward(this.block);
    else doc.placement.moveBackward(this.block);
    doc.crud.undoManager.stopCapturing();
    this.refresh();
  }
  openSettings(): void {
    if (!this.writable || !this.settingsLabel) return;
    const date = this.dateBlock;
    if (date) {
      this.dateDraft = hasDraftProps(date.meta);
      this.dateProps = projectDraftProps(date.props, date.meta, DATE_CARD_WATCHED_PROPS);
    }
    this.settingsTrigger?.nativeElement.focus({preventScroll: true});
    this.settingsOpen = true;
    this.cdr.markForCheck();
    this.layoutChange.emit();
  }
  closeSettings(event?: Event): void {
    event?.preventDefault(); event?.stopPropagation();
    this.settingsTrigger?.nativeElement.focus({preventScroll: true});
    this.settingsOpen = false;
    this.cdr.markForCheck();
    this.layoutChange.emit();
  }
  protected onEscape(event: KeyboardEvent): void {
    // 子设置面板可能已同步取消；在稳定的工具栏 host 消费同一次 Escape。
    if (event.target instanceof Element && event.target.closest('.material-toolbar__settings')) this.closeSettings(event);
  }
  protected applyDateSettings(patch: Partial<DateCardModel['props']>): void {
    const date = this.dateBlock;
    if (date && this.writable && this.dateDraft === hasDraftProps(date.meta) && Object.keys(patch).length) {
      date.doc.crud.undoManager.stopCapturing();
      date.doc.crud.transact(() => {
        if (this.dateDraft) date.updateMeta(Object.fromEntries(Object.entries(patch).map(([key, value]) =>
          [draftPropMetaKey(key), value ?? (date.props[key] ? '' : null)])));
        else date.updateProps(patch);
      });
      date.doc.crud.undoManager.stopCapturing();
    }
    this.closeSettings();
  }
}
