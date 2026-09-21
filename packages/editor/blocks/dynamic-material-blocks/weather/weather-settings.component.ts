import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, NgZone, OnChanges, OnDestroy, inject} from '@angular/core'
import {Subscription} from 'rxjs'
import {CsButtonComponent, CsColorPickerComponent, CsOptionComponent, CsSelectComponent, CsSwitchComponent} from '@cses/ui'
import {WeatherCardComponent} from './weather-card.component'
import {readFrozenWeather} from './weather-anchor.const'
import {defineBorderConfigs} from '../kernel/material-border.util'
import {resolveWeatherLayout} from './weather-presentation'
import {WEATHER_STYLES} from './weather.styles'
import {WEATHER_PALETTES, weatherPalettePatch, type WeatherPalette} from './weather-presentation'
import {readWeatherLook} from './weather-look.util'
import {WEATHER_WATCHED_PROPS, type WeatherBlockComponent, type WeatherModel} from './weather-render.component'
import {hasDraftProps, projectDraftProps, draftPropMetaKey} from '../draft-props'

/** 天气专属设置；持有明确的块引用，面板取焦不会丢失目标。 */
@Component({
  selector:'bc-weather-settings', standalone:true, imports:[WeatherCardComponent, CsButtonComponent, CsColorPickerComponent, CsOptionComponent, CsSelectComponent, CsSwitchComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  host:{'data-bc-native-input':''},
  templateUrl:'./weather-settings.component.html',
  styleUrl:'./weather-settings.component.scss',
})
export class WeatherSettingsComponent implements OnChanges, OnDestroy {
  @Input({required:true}) block!: WeatherBlockComponent
  @Output() readonly apply = new EventEmitter<void>()
  @Output() readonly cancel = new EventEmitter<void>()
  readonly styleOptions = WEATHER_STYLES.config.options
  readonly borders = defineBorderConfigs()[0].options!
  private pending: Partial<WeatherModel['props']> = {}
  readonly palettes = WEATHER_PALETTES
  readonly colors = [{key:'fg',label:'文字 / 主色'},{key:'accent',label:'强调色'},{key:'line',label:'线条色'},{key:'bg',label:'背景色'},{key:'bc',label:'边框色'}] as const
  props: WeatherModel['props'] = {}
  look = readWeatherLook()
  private subscriptions = new Subscription()
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly zone = inject(NgZone)
  ngOnChanges(): void {
    this.subscriptions.unsubscribe(); this.subscriptions = new Subscription(); this.pending = {}
    const refresh = () => this.zone.run(() => {
      this.props = {...projectDraftProps(this.block.props, this.block.meta, WEATHER_WATCHED_PROPS), ...this.pending}
      this.look = readWeatherLook(this.props); this.cdr.markForCheck()
    })
    this.subscriptions.add(this.block.onPropsChange.subscribe(refresh))
    this.subscriptions.add(this.block.doc.onMetaUpdate$.subscribe(event => {
      if (event.transactions.some(t => t.blockId === this.block.id)) refresh()
    }))
    this.subscriptions.add(this.block.doc.subscribeReadonlyChange(refresh))
    refresh()
  }
  ngOnDestroy(): void { this.subscriptions.unsubscribe() }
  patch(patch: Partial<WeatherModel['props']>): void {
    this.pending = {...this.pending, ...patch}
    this.props = {...this.props, ...patch}
    this.look = readWeatherLook(this.props)
  }
  confirm(): void {
    const patch = this.pending
    if (!Object.keys(patch).length) { this.apply.emit(); return }
    const {block} = this
    if (block.isReadonly || !block.doc.model.exists(block.id)) return
    block.doc.crud.undoManager.stopCapturing()
    block.doc.crud.transact(() => {
      if (hasDraftProps(block.meta)) block.updateMeta(Object.fromEntries(Object.entries(patch).map(([key,value]) => [draftPropMetaKey(key),value ?? ''])))
      else block.updateProps(patch)
    })
    block.doc.crud.undoManager.stopCapturing()
    this.pending = {}
    this.apply.emit()
  }
  setPalette(value: unknown): void {
    if (value !== null && typeof value !== 'string') return
    if (!value) this.patch({...weatherPalettePatch('document'), palette:null})
    else if (this.palettes.some(p=>p.id===value)) this.patch(weatherPalettePatch(value as WeatherPalette))
  }
  setTransparent(transparent: boolean): void {
    const preset = readWeatherLook({...this.props, bg:null}).bg
    this.patch({bg:transparent ? 'transparent' : preset === 'transparent' ? 'var(--bc-bg-primary, #fff)' : null})
  }
  set(key: string, value: unknown): void {
    if (value !== null && typeof value !== 'string') return
    this.patch({[key]:value || null})
  }
  resetColors(): void { this.patch(Object.fromEntries(this.colors.map(color => [color.key,null]))) }
  get previewWeather() { return readFrozenWeather(this.props.frozen) }
  get previewSize() { const layout = resolveWeatherLayout(this.look.style); return {width:layout.width + 8,height:layout.height + 8} }
  get previewFit() {
    const {width,height} = this.previewSize, scale = Math.min(84 / width,108 / height,1)
    return {width:width*scale,height:height*scale,scale}
  }
}
