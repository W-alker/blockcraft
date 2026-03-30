import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
} from "@angular/core";
import {NzEmptyModule} from "ng-zorro-antd/empty";
import {NzButtonComponent} from "ng-zorro-antd/button";
import {IMentionData, MentionType} from "../types";
import {NgForOf, NgIf} from "@angular/common";

const MENTION_TABS: {
  label: string,
  type: MentionType
}[] = [
  {
    label: '人员',
    type: 'user'
  },
  {
    label: '文档',
    type: 'doc'
  }
]

@Component({
  selector: 'mention-dialog',
  templateUrl: './mention-dialog.html',
  styleUrls: ['./mention-dialog.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    NzEmptyModule,
    NzButtonComponent
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

  @Output() tabChange = new EventEmitter<MentionType>()
  @Output() confirm = new EventEmitter<IMentionData>()
  @Output() close = new EventEmitter<boolean>()

  protected readonly MENTION_TABS = MENTION_TABS

  @HostListener('mousedown', ['$event'])
  mousedown(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    public readonly cdr: ChangeDetectorRef
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
    this.elementRef.nativeElement.querySelector('.mention-dialog__content__item.active')?.scrollIntoView({block: 'center'})
    this.cdr.detectChanges()
  }

  ngOnInit() {
    this.onTabChange(0)
  }

  onItemClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const target = e.target
    if (!(target instanceof HTMLElement)) return
    const itemElement = target.closest('.mention-dialog__content__item')
    if (!itemElement) return
    const item = this.list.find(i => i.id === itemElement.getAttribute('data-id'))
    if (!item) return;
    this.confirm.emit(item)
  }

  onSure() {
    if (!this.list.length) return
    this.confirm.emit(this.list[this.selectIndex])
  }

  onTabChange(index: number) {
    this.activeTabIndex = index
    this.selectIndex = 0
    this.tabChange.emit(MENTION_TABS[index].type)
  }

  ngOnDestroy() {
    this.close.emit(true)
  }

}
