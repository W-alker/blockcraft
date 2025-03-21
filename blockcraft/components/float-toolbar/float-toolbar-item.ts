import { Component, Input, TemplateRef, ViewChild } from '@angular/core';
import {BcFloatToolbarComponent} from "./float-toolbar";
import {NgIf, NgTemplateOutlet} from "@angular/common";

@Component({
  selector: 'bc-float-toolbar-item',
  template: `
    <div class="toolbar-item">
      <ng-content></ng-content>
    </div>
  `,
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    NgTemplateOutlet,
    NgIf
  ],
  styles: [`
    .toolbar-item {
      /* 子项默认样式 */
      padding: 10px;
    }
  `]
})
export class BcFloatToolbarItemComponent {
}
