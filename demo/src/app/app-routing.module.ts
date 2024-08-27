import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'app2',
    loadComponent: () => import('./app2.component').then(m => m.App2Component)
  },
  {
    path: 'app3',
    loadComponent: () => import('./app3.component').then(m => m.App3Component)
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
