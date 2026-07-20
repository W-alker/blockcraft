import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { DebugSections, TemplateDebugPanelComponent } from './template-debug-panel.component'

const MIN_W = 220
const MAX_W = 600

/**
 * 左侧调试侧栏：可折叠 + 右边缘拖拽调宽。设计页/使用页共用（避免两处重复折叠+拖拽逻辑）。
 * :host{display:contents} 让内部 <aside> 直接成为父级 flex item，宽度绑在它身上。
 */
@Component({
  selector: 'template-debug-aside',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TemplateDebugPanelComponent],
  template: `
    <aside class="tpl-page__panel tpl-page__panel--left"
           [class.is-collapsed]="!open()" [class.is-resizing]="resizing()"
           [style.width.px]="open() ? width() : null">
      @if (open()) {
        <div class="tpl-panel__head">
          <span class="tpl-panel__title">调试</span>
          <!-- 区块显隐开关：勾选=显示对应调试块（set=设置卡 / data=实时数据 / selection=实时选区） -->
          <span class="tpl-panel__checks">
            <label class="tpl-panel__check"><input type="checkbox" [checked]="sections().set" (change)="toggleSection('set', $event)" />set</label>
            <label class="tpl-panel__check"><input type="checkbox" [checked]="sections().data" (change)="toggleSection('data', $event)" />data</label>
            <label class="tpl-panel__check"><input type="checkbox" [checked]="sections().selection" (change)="toggleSection('selection', $event)" />selection</label>
          </span>
          <button class="tpl-panel__toggle" type="button" title="收起" (click)="open.set(false)">
            <i class="bc_icon bc_daohangshouqi"></i>
          </button>
        </div>
        @if (doc) { <template-debug-panel [doc]="doc" [visible]="sections()"></template-debug-panel> }
        <!-- 右边缘拖拽条：按住左右拖即调宽 -->
        <div class="tpl-panel__resizer" title="拖拽调整宽度" (pointerdown)="startResize($event)"></div>
      } @else {
        <button class="tpl-panel__expand" type="button" title="展开调试" (click)="open.set(true)">
          <i class="bc_icon bc_daohangzhankai"></i>
        </button>
      }
    </aside>
  `,
  styles: [`:host{ display:contents }`],
})
export class TemplateDebugAsideComponent {
  @Input() doc: BlockCraftDoc | null = null
  protected readonly open = signal(true)
  protected readonly width = signal(320)
  protected readonly resizing = signal(false)
  /** 三个调试区块的显隐（checkbox 在本组件标题行，状态也归它管；面板只读值渲染）。默认全显。 */
  protected readonly sections = signal<DebugSections>({ set: true, data: true, selection: true })

  toggleSection(key: keyof DebugSections, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked
    this.sections.update(s => ({ ...s, [key]: checked }))
  }

  // 拖拽调宽：pointer 全局监听，clamp 到 [MIN_W, MAX_W]；拖拽期间禁选中 + 改光标。
  startResize(e: PointerEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = this.width()
    this.resizing.set(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const onMove = (ev: PointerEvent): void => {
      this.width.set(Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX)))
    }
    const onUp = (): void => {
      this.resizing.set(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
}
