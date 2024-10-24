import {
  ChangeDetectionStrategy,
  Component, ElementRef, EmbeddedViewRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output, TemplateRef, ViewChild, ViewContainerRef
} from '@angular/core';
import {IToolbarMenuItem} from "./float-text-toolbar.type";
import {CommonModule} from "@angular/common";

const markList: IToolbarMenuItem = {
  name: "mark",
  icon: "bf_jihaobi",
  intro: "高亮颜色",
  value: null,
  children: [
    {
      name: "mark",
      value: '#F4F5F5',
    },
    {
      name: "mark",
      value: '#E0FEFE',
    },
    {
      name: "mark",
      value: '#FEDEDE',
    },
    {
      name: "mark",
      value: '#FFE6CD',
    },
    {
      name: "mark",
      value: '#FFEFBA',
    },
    {
      name: "mark",
      value: '#D3F3D2',
    },
    {
      name: "mark",
      value: '#DCE7FE',
    },
    {
      name: "mark",
      value: '#E9DFFC',
    },
  ]
}

const alignList: IToolbarMenuItem = {
  name: "align",
  value: "left",
  icon: "bf_suojinheduiqi",
  intro: "文字方向",
  children: [
    {
      name: "align",
      icon: "bf_zuoduiqi",
      intro: "左对齐",
      value: "left",
    },
    {
      name: "align",
      value: "center",
      icon: "bf_juzhongduiqi",
      intro: "居中",
    },
    {
      name: "align",
      value: "right",
      icon: "bf_youduiqi",
      intro: "右对齐",
    }
  ],
}

@Component({
  selector: 'bf-float-text-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './float-text-toolbar.html',
  styleUrls: ['./float-text-toolbar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloatTextToolbar {
  @Input()
  set expandToolbarList(val: IToolbarMenuItem[]) {
    this.toolbarMenuList.push(...val)
  }

  @HostBinding('style.top.px')
  @Input()
  top = 0

  @HostBinding('style.left.px')
  @Input()
  left = 0

  @Output('itemClick') itemClick = new EventEmitter<IToolbarMenuItem>()

  @ViewChild('alignTpl', {read: TemplateRef}) alignTpl!: TemplateRef<any>
  @ViewChild('markTpl', {read: TemplateRef}) markTpl!: TemplateRef<any>
  @ViewChild('container', {read: ViewContainerRef}) container!: ViewContainerRef

  protected readonly toolbarMenuList: Array<IToolbarMenuItem> = [
    alignList,
    {
      name: "|",
      value: "|",
    },
    {
      name: "bold",
      icon: "bf_jiacu",
      intro: "加粗",
      value: true,
    },
    {
      name: "strike",
      icon: "bf_shanchuxian",
      intro: "删除线",
      value: true,
    },
    {
      name: "underline",
      icon: "bf_xiahuaxian",
      intro: "下划线",
      value: true,
    },
    {
      name: "italic",
      icon: "bf_xieti",
      intro: "斜体",
      value: true,
    },
    {
      name: "code",
      icon: "bf_daimakuai",
      intro: "代码",
      value: true,
    },
    markList
  ]

  protected readonly alignList = alignList
  protected readonly markList = markList

  private prevOverItem = ''
  embedViewRef?: EmbeddedViewRef<any>

  constructor(
    private elementRef: ElementRef,
    private vcr: ViewContainerRef
  ) {
  }

  @HostListener('mousedown', ['$event'])
  onMousedown(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    e.preventDefault()
    if(!item) return
    this.itemClick.emit(item)
  }

  onMouseEnter(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    if (this.prevOverItem !== item.name && this.embedViewRef) {
      this.embedViewRef.destroy()
    }
    this.prevOverItem = item.name
    if (!item.children) return
    const dom = this.elementRef.nativeElement.querySelector(`[data-name="${item.name}"]`) as HTMLElement
    switch (item.name) {
      case "align":
        this.embedViewRef = this.vcr.createEmbeddedView(this.alignTpl, {$implicit: 'left: 0; top: 24px'})
        break
      case "mark":
        this.embedViewRef = this.vcr.createEmbeddedView(this.markTpl, {$implicit: 'right: 0; top: 24px; transform: translateX(50%);'})
        break
    }
    dom.appendChild(this.embedViewRef?.rootNodes[0] as HTMLElement)
  }

  onMouseLeave(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    this.prevOverItem = ''
    this.embedViewRef && this.embedViewRef.destroy()
  }

}
