import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core'
import {CsButtonComponent} from '@cses/ui'
import {WeatherSettingsComponent} from '../../blocks/dynamic-material-blocks/weather/weather-settings.component'
import type {WeatherBlockComponent} from '../../blocks/dynamic-material-blocks/weather/weather-render.component'

@Component({
  selector:'bc-weather-toolbar', standalone:true,
  imports:[CsButtonComponent, WeatherSettingsComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  host:{'data-bc-native-input':'','data-testid':'weather-toolbar'},
  template:`
    <div class="weather-toolbar" role="group" aria-label="天气浮动工具栏">
      @if (block.canRefreshWeather) {
        <button class="refresh-trigger" cs-button csType="text" csSize="sm" type="button" aria-label="刷新天气"
          [title]="block.weatherStatus === 'loading' ? '刷新中…' : '刷新天气'"
          [csLoading]="block.weatherStatus === 'loading'" (click)="block.refreshWeather()">
          @if (block.weatherStatus !== 'loading') { <i class="bc_icon bc_huanyige" aria-hidden="true"></i> }
        </button>
      }
      @if (!expanded) {
        <button class="settings-trigger" cs-button csType="secondary" csSize="sm" type="button" aria-label="天气样式与配色" title="天气设置" [attr.aria-expanded]="expanded"
          (click)="expanded = true; layoutChange.emit()">
          <i class="bc_icon bc_shezhi" aria-hidden="true"></i>
        </button>
      }
    </div>
    @if (expanded) {
      <bc-weather-settings [block]="block" (apply)="close.emit()" (cancel)="close.emit()" />
    }
  `,
  styles:[`
    :host {display:block;color:var(--bc-color);font:13px var(--bc-font-family);}
    .weather-toolbar {display:flex;align-items:center;gap:4px;}
    .settings-trigger, .refresh-trigger {display:inline-flex;align-items:center;justify-content:center;width:28px;min-width:28px;height:28px;padding:0;}
    .refresh-trigger {color:var(--bc-color);background:transparent;border-color:transparent;}
    @media (any-hover:hover) {
      .refresh-trigger:hover:not(:disabled) {color:var(--bc-color);background:var(--bc-float-toolbar-item-hover-bg);}
    }
    .refresh-trigger:active:not(:disabled) {color:var(--bc-active-color);background:var(--bc-float-toolbar-item-hover-bg);}
    .refresh-trigger:focus-visible {outline-color:var(--bc-active-color);}
    @media print {:host {display:none;}}
  `],
})
export class WeatherToolbarComponent {
  @Input({required:true}) block!: WeatherBlockComponent
  @Output() layoutChange = new EventEmitter<void>()
  @Output() close = new EventEmitter<void>()
  expanded = false
}
