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
    path: 'doc/:id',
    loadComponent: () => import('../pages/doc-page/doc-page').then(m => m.DocPageComponent)
  },
  {
    path: 'test',
    loadComponent: () => import('./test-page').then(m => m.TestPage)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
