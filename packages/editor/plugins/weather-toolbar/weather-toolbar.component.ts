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
    @if (expanded) {
      <bc-weather-settings [block]="block" (apply)="close.emit()" (cancel)="close.emit()" />
    } @else {
    <div class="weather-toolbar" role="group" aria-label="天气浮动工具栏">
      <button cs-button csType="secondary" csSize="sm" type="button" aria-label="天气样式与配色" title="天气设置" [attr.aria-expanded]="expanded"
        (click)="expanded = !expanded; layoutChange.emit()">
        <i class="bc_icon bc_shezhi" aria-hidden="true"></i>
      </button>
    </div>
    }
  `,
  styles:[`
    :host {display:block;color:var(--bc-color);font:13px var(--bc-font-family);}
    .weather-toolbar {display:flex;}
    button {display:inline-flex;align-items:center;justify-content:center;width:28px;min-width:28px;height:28px;padding:0;}
    @media print {:host {display:none;}}
  `],
})
export class WeatherToolbarComponent {
  @Input({required:true}) block!: WeatherBlockComponent
  @Output() layoutChange = new EventEmitter<void>()
  @Output() close = new EventEmitter<void>()
  expanded = false
}
