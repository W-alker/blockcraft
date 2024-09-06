import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {IMentionData} from "../index";

@Component({
  selector: 'mention-dialog',
  templateUrl: './mention-dialog.html',
  styleUrls: ['./mention-dialog.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MentionDialog {

  @HostBinding('style.top.px')
  @Input()
  top = 0

  @HostBinding('style.left.px')
  @Input()
  left = 0

  @Input()
  list: IMentionData[] = []

  @Output() itemSelect = new EventEmitter<IMentionData>()

  @HostListener('mousedown', ['$event'])
  mousedown(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {
  }

  protected selectIndex = 0

  moveSelect(direction: 'up' | 'down') {
    if (direction === 'up') {
      this.selectIndex = Math.max(0, this.selectIndex - 1)
    } else {
      this.selectIndex = Math.min(this.list.length - 1, this.selectIndex + 1)
    }
    this.cdr.detectChanges()
  }

  ngAfterViewInit() {
    // 确保元素在视口内
    const rect = this.elementRef.nativeElement.getBoundingClientRect()
    const {innerHeight, innerWidth} = window
    if (rect.bottom > innerHeight) {
      this.top = innerHeight - rect.height - 10
    }
    if (rect.right > innerWidth) {
      this.left = innerWidth - rect.width - 10
    }
  }

  onItemClick(e: Event, item: IMentionData) {
    console.log(item)
    this.itemSelect.emit(item)
  }

  onSure() {
    this.itemSelect.emit(this.list[this.selectIndex])
  }


}
