import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, ComponentRef, ElementRef, EmbeddedViewRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output, TemplateRef, ViewChild, ViewContainerRef
} from '@angular/core';
import {IToolbarMenuItem} from "./float-text-toolbar.type";
import {CommonModule} from "@angular/common";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {ColorPalette} from "../../../components/color-palette/color-palette";
import {fromEvent, takeUntil} from "rxjs";

const markMenu = {
  name: "mark",
  icon: "bf_jihaobi",
  intro: "高亮颜色",
  activeColor: null,
  activeBgColor: null,
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
  order: 0
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
      order: 1
    },
    {
      name: "bold",
      icon: "bf_jiacu",
      intro: "加粗",
      value: true,
      order: 2
    },
    {
      name: "strike",
      icon: "bf_shanchuxian",
      intro: "删除线",
      value: true,
      order: 3
    },
    {
      name: "underline",
      icon: "bf_xiahuaxian",
      intro: "下划线",
      value: true,
      order: 4
    },
    {
      name: "italic",
      icon: "bf_xieti",
      intro: "斜体",
      value: true,
      order: 5
    },
    {
      name: "code",
      icon: "bf_daimakuai",
      intro: "代码",
      value: true,
      order: 6
    }
  ]

  protected readonly alignList = alignList
  protected readonly markMenu = markMenu

  private prevOverItem = ''
  embedViewRef?: EmbeddedViewRef<any>

  constructor(
    private elementRef: ElementRef,
    private overlay: Overlay,
    private vcr: ViewContainerRef,
    private cdRef: ChangeDetectorRef
  ) {
  }

  @HostListener('mousedown', ['$event'])
  onMousedown(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    e.preventDefault()
    if (!item) return
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
        dom.appendChild(this.embedViewRef?.rootNodes[0] as HTMLElement)
        break
    }
  }

  onMark(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    this.itemClick.emit({
      name: 'bc',
      value: this.markMenu.activeBgColor
    })
  }

  onMarkMouseEnter(e: MouseEvent) {
    const target = e.target as HTMLElement
    this.showColorPicker(target)
  }

  private _colorPickerCpr?: ComponentRef<ColorPalette> | null

  showColorPicker(target: HTMLElement) {
    if(this._colorPickerCpr) return
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
      {originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top'},
    ])
    const portal = new ComponentPortal(ColorPalette)
    const ovr = this.overlay.create({
      positionStrategy,
      // hasBackdrop: true,
      // backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    this._colorPickerCpr = ovr.attach(portal)
    this._colorPickerCpr.setInput('activeColor', this.markMenu.activeColor)
    this._colorPickerCpr.setInput('activeBgColor', this.markMenu.activeBgColor)
    const cprNode = this._colorPickerCpr.location.nativeElement

    fromEvent<MouseEvent>(target, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
      if (cprNode.contains(e.relatedTarget as Node)) return
      ovr.dispose()
      this._colorPickerCpr = null
    })

    fromEvent<MouseEvent>(cprNode, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
      if (target.contains(e.relatedTarget as Node)) return
      ovr.dispose()
      this._colorPickerCpr = null
    })

    this._colorPickerCpr.instance.colorChange.pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe((res) => {
      if(res.type === 'c') {
        this.markMenu.activeColor = <any>res.value
      }
      if(res.type === 'bc') {
        this.markMenu.activeBgColor = <any>res.value
      }
      this.cdRef.detectChanges()
      this.itemClick.emit({
        name: res.type,
        value: res.value
      })
    })

  }

  onMouseLeave(e: MouseEvent, item: IToolbarMenuItem) {
    e.stopPropagation()
    this.prevOverItem = ''
    this.embedViewRef && this.embedViewRef.destroy()
  }

}
