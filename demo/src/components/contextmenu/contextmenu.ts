import {Component, EventEmitter, HostBinding, HostListener, Input, Output} from "@angular/core";
import {IContextMenuItem} from "./contextmenu.type";
import {NgForOf, NgIf} from "@angular/common";

@Component({
  selector: 'doc-contextmenu',
  templateUrl: './contextmenu.html',
  styleUrls: ['./contextmenu.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ]
})
export class ContextMenuComponent {
  @Input({required: true}) items: IContextMenuItem[] = []

  @HostBinding('style.width.px')
  @Input()
  readonly width = 200

  @Output() itemClick = new EventEmitter<IContextMenuItem>()

  constructor() {
  }

  @HostListener('click', ['$event'])
  onClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  onItemClick(e: MouseEvent, item: IContextMenuItem) {
    this.itemClick.emit(item)
  }
}
