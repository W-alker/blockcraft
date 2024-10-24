import {Component} from "@angular/core";
import {NgIf} from "@angular/common";

@Component({
  selector: 'div.float-toolbar',
  template: `
    <div class="bf-float-toolbar__item" (mousedown)="onMousedown($event, menu)">
      <i [class]="['bf_icon', menu.icon]"></i>
      <i class="bf_icon bf_xiajaintou dropdown" *ngIf="menu.children"></i>
    </div>
  `,
  styles: [``],
  standalone: true,
  imports: [
    NgIf
  ]
})
export class CalloutBlockFloatToolbar {

  toolbarMenus = [
    {
      icon: 'bf_shoucang',
      value: '',
    }
  ]
}
