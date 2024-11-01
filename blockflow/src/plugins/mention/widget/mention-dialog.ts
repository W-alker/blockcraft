import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output, TemplateRef
} from "@angular/core";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {IMentionData, MentionType} from "../index";
import {NzEmptyModule} from "ng-zorro-antd/empty";
import {NzTabsModule} from "ng-zorro-antd/tabs";

@Component({
  selector: 'mention-dialog',
  templateUrl: './mention-dialog.html',
  styleUrls: ['./mention-dialog.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    NgTemplateOutlet,
    NzEmptyModule,
    NzTabsModule
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
  template?: TemplateRef<{item: IMentionData, type: MentionType}>

  @Input()
  list: IMentionData[] = []

  @Output() tabChange = new EventEmitter<MentionType>()
  @Output() itemSelect = new EventEmitter<IMentionData>()
  @Output() close = new EventEmitter<boolean>()

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

  activeTabIndex = 0
  protected selectIndex = 0

  moveSelect(direction: 'up' | 'down') {
    if (direction === 'up') {
      this.selectIndex = Math.max(0, this.selectIndex - 1)
    } else {
      this.selectIndex = Math.min(this.list.length - 1, this.selectIndex + 1)
    }
    this.cdr.detectChanges()
  }

  ngOnInit() {
    this.onTabChange(0)
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
    e.preventDefault()
    e.stopPropagation()
    this.itemSelect.emit(item)
  }

  onSure() {
    this.itemSelect.emit(this.list[this.selectIndex])
  }

  onTabChange(index: number) {
    this.activeTabIndex = index
    this.selectIndex = 0
    this.tabChange.emit(index === 0 ? 'user' : 'doc')
  }

  ngOnDestroy() {
    this.close.emit(true)
  }

}
