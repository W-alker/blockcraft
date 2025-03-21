import {Overlay} from '@angular/cdk/overlay';
import {Component, ElementRef, Input, TemplateRef, ViewChild, ViewContainerRef, HostListener} from '@angular/core';

@Component({
  selector: 'bc-float-toolbar',
  template: `
    <ng-content></ng-content>
  `,
  standalone: true,
  styles: [`
    :host {
      /* 默认样式 */
      border: 1px solid #ccc;
      background-color: #fff;
      padding: 10px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }
  `]
})
export class BcFloatToolbarComponent {
  @ViewChild('toolbarTemplate') toolbarTemplate!: TemplateRef<any>;

  constructor(private overlay: Overlay, private viewContainerRef: ViewContainerRef) {
  }
}
