import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

/**
 * 应用外壳：只挂一个 <router-outlet>，承接 index.html 的 <bc-root>。
 * 原来 AppComponent 直接当 bootstrap 根；引入路由后改由它做根，
 * '' → AppComponent（主 playground 原样不动），'template' → 模板装饰页。
 */
@Component({
  selector: 'bc-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppShellComponent {}
