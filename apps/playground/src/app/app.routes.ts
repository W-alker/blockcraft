import { Routes } from '@angular/router'
import { AppComponent } from './app.component'

/**
 * '' → 主 playground（编辑器 / Snapshot Viewer）。
 * 'template' → 模板装饰设计页（左调试 + 中编辑 + 右装饰面板），懒加载。
 * 'template/use' → 使用模版页（左调试 + 中编辑，无插入面板），渲染真实数据，懒加载。
 */
export const routes: Routes = [
  { path: '', component: AppComponent },
  {
    path: 'template',
    loadComponent: () =>
      import('./template-deco/template-page.component').then(m => m.TemplatePageComponent),
  },
  {
    path: 'template/use',
    loadComponent: () =>
      import('./template-deco/template-use-page.component').then(m => m.TemplateUsePageComponent),
  },
]
