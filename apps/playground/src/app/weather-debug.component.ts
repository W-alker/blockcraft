import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core'
import {BlockCraftDoc, WEATHER_STYLES} from '@ccc/blockcraft'

@Component({
  selector:'playground-weather-debug', standalone:true,
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<button type="button" (click)="insertExamples()" [disabled]="doc?.isInitialized && doc?.isReadonly">插入天气样式示例</button>`,
  styles:[`button{font:inherit;font-size:12px;padding:7px 10px;color:var(--bc-color);background:var(--bc-bg-primary);border:1px solid var(--bc-border-color);border-radius:6px;cursor:pointer;}`],
})
export class WeatherDebugComponent {
  @Input() doc: BlockCraftDoc | null = null
  @Output() prepare = new EventEmitter<void>()
  async insertExamples(): Promise<void> {
    this.prepare.emit()
    const doc = this.doc
    if (!doc?.isInitialized || doc.isReadonly) return
    const snapshots = WEATHER_STYLES.all.map(style => ({...doc.schemas.createSnapshot('weather',[]), props:{style:style.id,date:'2026-09-21',frozen:{tone:'cloudy',temp:24,condition:'多云',location:'杭州',high:27,low:19}}}))
    doc.crud.insertBlockSnapshots(doc.rootId,0,snapshots)
    if (await doc.navigateToBlock(snapshots[0].id)) doc.selection.selectBlock(doc.getBlockById(snapshots[0].id))
  }
}
