import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core'
import {CsButtonComponent, CsTooltipDirective} from '@cses/ui'
import {WeatherSettingsComponent} from '../../blocks/dynamic-material-blocks/weather/weather-settings.component'
import type {WeatherBlockComponent} from '../../blocks/dynamic-material-blocks/weather/weather-render.component'

@Component({
  selector:'bc-weather-toolbar', standalone:true,
  imports:[CsButtonComponent, CsTooltipDirective, WeatherSettingsComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  host:{'data-bc-native-input':'','data-testid':'weather-toolbar'},
  template:`
    @if (!expanded) {
      <div class="weather-toolbar" role="group" aria-label="天气浮动工具栏">
        @if (block.canRefreshWeather) {
          <button class="refresh-trigger" cs-button csType="text" csSize="sm" type="button" aria-label="刷新天气"
            [csTooltip]="block.weatherStatus === 'loading' ? '刷新中…' : '刷新天气'"
            [csLoading]="block.weatherStatus === 'loading'" (click)="block.refreshWeather()">
            @if (block.weatherStatus !== 'loading') { <i class="bc_icon bc_huanyige" aria-hidden="true"></i> }
          </button>
        }
        <button class="settings-trigger" cs-button csType="text" csSize="sm" type="button" aria-label="天气样式与配色" csTooltip="天气设置" [attr.aria-expanded]="expanded"
          (click)="expanded = true; layoutChange.emit()">
          <i class="bc_icon bc_shezhi" aria-hidden="true"></i>
        </button>
      </div>
    }
    @if (expanded) {
      <bc-weather-settings [block]="block" (apply)="close.emit()" (cancel)="close.emit()" />
    }
  `,
  styles:[`
    /* 沿用 Overlay 的实际可用高度，将收缩约束传递给设置卡的内容区。 */
    :host {display:flex;flex-direction:column;min-height:0;max-height:inherit;color:var(--bc-color);font:13px var(--bc-font-family);}
    .weather-toolbar {
      display:flex;flex:none;align-items:center;gap:2px;padding:3px;border-radius:8px;
      background:var(--bc-float-toolbar-bg);box-shadow:var(--bc-float-toolbar-shadow);
      border:1px solid var(--bc-float-toolbar-divider-color);
    }
    .settings-trigger, .refresh-trigger {
      display:inline-flex;align-items:center;justify-content:center;
      width:28px;min-width:28px;height:28px;padding:0;border:0;border-radius:5px;box-shadow:none;
      color:var(--bc-float-toolbar-item-color);background:transparent;
    }
    @media (any-hover:hover) {
      .weather-toolbar button:hover:not(:disabled) {color:var(--bc-float-toolbar-item-color);background:var(--bc-float-toolbar-item-hover-bg);}
    }
    .weather-toolbar button:active:not(:disabled) {color:var(--bc-active-color);background:var(--bc-float-toolbar-item-active-bg);}
    .weather-toolbar button:focus-visible {outline:2px solid var(--bc-active-color);outline-offset:-2px;}
    .weather-toolbar button:disabled {color:var(--bc-secondary-color);}
    @media print {:host {display:none;}}
  `],
})
export class WeatherToolbarComponent {
  @Input({required:true}) block!: WeatherBlockComponent
  @Output() layoutChange = new EventEmitter<void>()
  @Output() close = new EventEmitter<void>()
  expanded = false
}
