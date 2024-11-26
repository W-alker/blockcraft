import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output} from "@angular/core";
import {BlockSchema} from "../../../core";
import {NgForOf, NgTemplateOutlet} from "@angular/common";
import {MatIcon} from "@angular/material/icon";

@Component({
  selector: 'block-transform-contextmenu',
  template: `
    <ul class="list">
      <li class="list__item" *ngFor="let item of blocks; index as idx" [title]="item.description || item.label"
          (mousedown)="onMouseDown($event, item)" [class.active]="activeIdx === idx" (mouseenter)="activeIdx = idx">
        @if (item.svgIcon) {
          <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
        } @else {
          <i [class]="item.icon"></i>
        }
        <span>{{ item.label }}</span>
      </li>
    </ul>
  `,
  styleUrls: ['contextmenu.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgTemplateOutlet,
    MatIcon
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockTransformContextMenu {
  @Input() blocks: BlockSchema[] = []

  @Output() blockSelected = new EventEmitter<BlockSchema>()

  constructor(
    public readonly cdr: ChangeDetectorRef
  ) {
  }

  activeIdx = 0

  selectUp() {
    if (this.activeIdx > 0) this.activeIdx--
    else this.activeIdx = this.blocks.length - 1
    this.cdr.markForCheck()
  }

  selectDown() {
    if (this.activeIdx < this.blocks.length - 1) this.activeIdx++
    else this.activeIdx = 0
    this.cdr.markForCheck()
  }

  select() {
    this.blockSelected.emit(this.blocks[this.activeIdx])
  }

  onMouseDown(event: MouseEvent, item: BlockSchema) {
    event.preventDefault()
    event.stopPropagation()
    this.blockSelected.emit(item)
  }
}
