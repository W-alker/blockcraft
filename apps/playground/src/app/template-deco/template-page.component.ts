import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { BlockCraftDoc } from '@ccc/blockcraft'
import {
  TemplateEditSurfaceComponent,
  TemplatePageViewState,
} from './surfaces/template-edit'
import { DecoInsertPanelComponent } from './palette/deco-insert-panel.component'
import { DecoLayoutPanelComponent } from './palette/deco-layout-panel.component'
import { TemplateDebugAsideComponent } from './debug-panel/template-debug-aside.component'
import { EditorViewState } from './debug-panel/editor-view-state'
import {TemplateRegionInspectorComponent} from './palette/template-region-inspector.component'

/**
 * /template 设计页：左「调试面板」+ 中「模板编辑」+ 右「装饰插入面板」+ 顶部「使用模版」。
 * 「使用模版」把当前模板（snapshot + 整页背景 + 分页状态）存入 TemplateStore，
 * 跳转 /template/use 使用页（不再弹预览窗）。
 */
@Component({
  selector: 'template-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EditorViewState],                       // 本页内：调试面板的宽度滑块与编辑 surface 共享同一实例
  imports: [TemplateEditSurfaceComponent, DecoInsertPanelComponent, DecoLayoutPanelComponent, TemplateRegionInspectorComponent, TemplateDebugAsideComponent, RouterLink],
  template: `
    <div class="tpl-page">
      <header class="tpl-page__bar">
        <a class="tpl-page__back" routerLink="/">← 返回</a>
        <span class="tpl-page__title">模板装饰</span>
        <button class="tpl-page__action" type="button" [disabled]="!editDoc()" (click)="useTemplate()">使用模版</button>
      </header>
      <div class="tpl-page__body">
        <template-debug-aside [doc]="editDoc()"></template-debug-aside>
        <main class="tpl-page__editor">
          <template-edit-surface
            (ready)="editDoc.set($event)"
            (pageViewStateChange)="pageViewState.set($event)">
          </template-edit-surface>
        </main>
        <aside class="tpl-page__panel tpl-page__panel--right" [class.is-collapsed]="!panelOpen()">
          @if (panelOpen()) {
            <div class="tpl-panel__head">
              <span class="tpl-panel__title">插入装饰</span>
              <button class="tpl-panel__toggle" type="button" title="收起" (click)="panelOpen.set(false)">
                <i class="bc_icon bc_daohangshouqi"></i>
              </button>
            </div>
            @if (editDoc(); as d) {
              <template-region-inspector [doc]="d"></template-region-inspector>
              <deco-layout-panel [doc]="d"></deco-layout-panel>
              <deco-insert-panel
                [doc]="d"
                [paginationEnabled]="pageViewState().paginationEnabled"
                [hasPageBackground]="pageViewState().hasBackground"
                (paginationToggle)="editSurface?.togglePagination()"
                (pickPageBackground)="editSurface?.pickPageBackground()"
                (clearPageBackground)="editSurface?.clearPageBackground()">
              </deco-insert-panel>
            }
          } @else {
            <button class="tpl-panel__expand" type="button" title="展开插入装饰" (click)="panelOpen.set(true)">
              <i class="bc_icon bc_daohangzhankai"></i>
            </button>
          }
        </aside>
      </div>
    </div>
  `,
})
export class TemplatePageComponent {
  @ViewChild(TemplateEditSurfaceComponent) protected editSurface?: TemplateEditSurfaceComponent
  private readonly router = inject(Router)
  protected readonly editDoc = signal<BlockCraftDoc | null>(null)
  protected readonly panelOpen = signal(true)
  protected readonly pageViewState = signal<TemplatePageViewState>({
    paginationEnabled: false,
    hasBackground: false,
  })

  /** 存当前模板（内容 + 整页背景 + 分页状态）→ 跳使用页。surface 先 flush 保证最新。 */
  useTemplate(): void {
    if (!this.editDoc()) return
    this.editSurface?.persist()
    void this.router.navigate(['/template/use'])
  }
}
