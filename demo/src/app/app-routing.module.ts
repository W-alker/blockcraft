import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('../pages/home-page/home-page').then(m => m.HomePage)
  },
  {
    path: 'space/:id',
    loadComponent: () => import('../pages/space-page/space-page').then(m => m.SpacePageComponent)
  },
  {
    path: '',
    loadComponent: () => import('./test-page').then(m => m.TestPage)
  },
  {
    path: 'test',
    loadComponent: () => import('./playground.page').then(m => m.PlaygroundPage)
  },
  {
    path: 'test2',
    loadComponent: () => import('./test2.page').then(m => m.Test2Page)
  },
  {
    path: 'test3',
    loadComponent: () => import('./test3.page').then(m => m.Test3Page)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
