import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { TemplateUseSurfaceComponent } from './surfaces/template-use'
import { TemplateDebugAsideComponent } from './debug-panel/template-debug-aside.component'
import { TemplateStore } from './data/template-store'
import { EditorViewState } from './debug-panel/editor-view-state'

/**
 * /template/use 使用页：和设计页同款（左调试 + 中编辑器），但**没有右侧插入装饰面板**。
 * 加载 TemplateStore 里存的模板（设计页点「使用模版」时存的），用 render 套渲染真实数据、可编辑填充正文。
 */
@Component({
  selector: 'template-use-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EditorViewState],                       // 本页内：调试面板的宽度滑块与使用 surface 共享同一实例
  imports: [TemplateUseSurfaceComponent, TemplateDebugAsideComponent, RouterLink],
  template: `
    <div class="tpl-page">
      <header class="tpl-page__bar">
        <a class="tpl-page__back" routerLink="/template">← 返回编辑</a>
        <span class="tpl-page__title">使用模版</span>
      </header>
      <div class="tpl-page__body">
        <template-debug-aside [doc]="useDoc()"></template-debug-aside>
        <main class="tpl-page__editor">
          <template-use-surface
            [snapshot]="payload?.snapshot ?? null"
            [background]="payload?.background ?? null"
            [paginationEnabled]="payload?.paginationEnabled === true"
            (ready)="useDoc.set($event)"></template-use-surface>
        </main>
      </div>
    </div>
  `,
})
export class TemplateUsePageComponent {
  private readonly store = inject(TemplateStore)
  protected readonly payload = this.store.load()
  protected readonly useDoc = signal<BlockCraftDoc | null>(null)
}
