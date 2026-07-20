import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AppShellComponent } from './app/app-shell.component';
import { routes } from './app/app.routes';
import { TEMPLATE_DATA, MockTemplateData } from './app/template-deco/data/template-data';

bootstrapApplication(AppShellComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(),
    provideRouter(routes),
    // 模板装饰数据源：移植 cses-client 时只换这一行的 useClass（→ RealTemplateData）
    { provide: TEMPLATE_DATA, useClass: MockTemplateData },
  ]
}).catch(err => console.error(err));
