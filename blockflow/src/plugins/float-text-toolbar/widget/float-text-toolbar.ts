import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output
} from '@angular/core';
import {IToolbarMenuItem, TOOLBAR_MENU_LIST} from "./float-text-toolbar.type";
import {CommonModule} from "@angular/common";

@Component({
  selector: 'bf-float-text-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './float-text-toolbar.html',
  styleUrls: ['./float-text-toolbar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloatTextToolbar {
  @HostBinding('style.top.px')
  @Input()
  top = 0

  @HostBinding('style.left.px')
  @Input()
  left = 0

  @Output('itemClick') itemClick = new EventEmitter<IToolbarMenuItem>()

  protected readonly toolbarMenuList: Array<IToolbarMenuItem> = [...TOOLBAR_MENU_LIST]

  @HostListener('mouseup', ['$event'])
  onMouseup(e: MouseEvent) {
    e.stopPropagation()
  }

  @HostListener('mousedown', ['$event'])
  onMousedown(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()

  }

}
