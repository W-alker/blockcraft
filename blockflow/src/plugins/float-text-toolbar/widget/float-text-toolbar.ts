import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, ComponentRef, DestroyRef, ElementRef, EmbeddedViewRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output, TemplateRef, ViewChild, ViewContainerRef
} from '@angular/core';
import {IToolbarMenuItem} from "./float-text-toolbar.type";
import {CommonModule} from "@angular/common";
import {ConnectedPosition, Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {ColorPalette} from "../../../components/color-palette/color-palette";
import {fromEvent, takeUntil} from "rxjs";

const POSITIONS: ConnectedPosition[] = [
  {originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top'},
  {originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom'}
]

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
  markMenu: any

  @Input()
  activeMenuSet?: Set<string>

  @Input() toolbarMenuList: Array<IToolbarMenuItem> = []

  @HostBinding('style')
  @Input()
  style: string = ''

  @Output('itemClick') itemClick = new EventEmitter<IToolbarMenuItem>()

  @ViewChild('childrenTpl', {read: TemplateRef}) childrenTpl!: TemplateRef<any>
  @ViewChild('markTpl', {read: TemplateRef}) markTpl!: TemplateRef<any>
  @ViewChild('container', {read: ViewContainerRef}) container!: ViewContainerRef

  private prevOverItem = ''
  embedViewRef?: EmbeddedViewRef<any>

  constructor(
    public readonly elementRef: ElementRef,
    private overlay: Overlay,
    private vcr: ViewContainerRef,
    public readonly cdRef: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
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
    this.embedViewRef = this.vcr.createEmbeddedView(this.childrenTpl, {children: item.children, style: 'left: 0; top: 24px'})
    dom.appendChild(this.embedViewRef?.rootNodes[0] as HTMLElement)
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
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions(POSITIONS)
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

    const ovrDispose = this.destroyRef.onDestroy(() => {
      ovr.dispose()
      ovrDispose()
    })

    fromEvent<MouseEvent>(target, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
      if (cprNode.contains(e.relatedTarget as Node)) return
      ovr.dispose()
      ovrDispose()
      this._colorPickerCpr = null
    })

    fromEvent<MouseEvent>(cprNode, 'mouseleave').pipe(takeUntil(this._colorPickerCpr.instance.close)).subscribe(e => {
      if (target.contains(e.relatedTarget as Node)) return
      ovr.dispose()
      ovrDispose()
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
