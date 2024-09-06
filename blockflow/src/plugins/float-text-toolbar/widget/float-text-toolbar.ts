import {
  ChangeDetectionStrategy,
  Component, DestroyRef, ElementRef, EmbeddedViewRef,
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
  icon: "editor-marker_pen",
  intro: "高亮颜色",
  value: '#FFEFBA',
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
  icon: "editor-xuqiuwendang_wenzhongzuoduiqi",
  intro: "文字方向",
  children: [
    {
      name: "align",
      icon: "editor-xuqiuwendang_wenzhongzuoduiqi",
      intro: "左对齐",
      value: "left",
    },
    {
      name: "align",
      value: "center",
      icon: "editor-xuqiuwendang_wenzhongyouduiqi",
      intro: "居中",
    },
    {
      name: "align",
      value: "right",
      icon: "editor-align_the_text_to_the_center",
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
      icon: "editor-bold01",
      intro: "加粗",
      value: true,
    },
    {
      name: "strike",
      icon: "editor-xuqiuwendang_shanchuxian",
      intro: "删除线",
      value: true,
    },
    {
      name: "underline",
      icon: "editor-xiahuaxian2",
      intro: "下划线",
      value: true,
    },
    {
      name: "italic",
      icon: "editor-xieti",
      intro: "斜体",
      value: true,
    },
    {
      name: "code",
      icon: "editor-code_block",
      intro: "代码",
      value: true,
    },
    markList,
    // {
    //   name: "连接",
    //   value: "link",
    //   icon: "editor-link",
    // },
    // {
    //   name: "|",
    // },
    // {
    //   name: "主标题",
    //   value: "h1",
    //   icon: "editor-xuqiuwendang_zhubiaoti",
    // },
    // {
    //   name: "次标题",
    //   value: "h2",
    //   icon: "editor-xuqiuwendang_cibiaoti",
    // },
    // {
    //   name: "三级标题",
    //   value: "h3",
    //   icon: "editor-subtitle",
    // },
    // {
    //   name: "|",
    // },
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
        this.embedViewRef = this.vcr.createEmbeddedView(this.alignTpl, {
          left: 0,
          top: 24,
        })
        break
      case "mark":
        this.embedViewRef = this.vcr.createEmbeddedView(this.markTpl, {
          left: 0,
          top: 24,
        })
    }
    dom.appendChild(this.embedViewRef?.rootNodes[0] as HTMLElement)
  }

  onMouseLeave(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    this.prevOverItem = ''
    this.embedViewRef && this.embedViewRef.destroy()
  }

}
