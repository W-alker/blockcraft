import {ChangeDetectionStrategy, Component, HostBinding, HostListener} from "@angular/core";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {FloatToolbar, IToolbarItem} from "../../components";
import {ICalloutBlockModel} from "./type";
import {EditableBlock} from "../../core";
import {ConnectedPosition, Overlay, OverlayRef} from "@angular/cdk/overlay";
import {fromEvent, Subject, take, takeUntil} from "rxjs";
import {ComponentPortal} from "@angular/cdk/portal";
import {ColorPalette} from "../../components/color-palette/color-palette";

const TOOLBAR_LIST: IToolbarItem[] = [
  {
    icon: 'bf_icon bf_yanse',
    name: 'color',
    title: '更换颜色'
  },
  {
    name: '|',
  },
  {
    icon: 'bf_icon bf_fuzhi',
    name: 'copy',
    title: '复制文本'
  }
]
const COPYED_TOOLBAR_LIST: IToolbarItem[] = [...TOOLBAR_LIST].slice(0, TOOLBAR_LIST.length - 1).concat({
  icon: 'bf_icon bf_fuzhi',
  name: 'copyed',
  title: '复制文本',
  text: '已复制',
  active: true
})
const POSITIONS: ConnectedPosition[] = [
  {originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top'},
  {originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom'},
]

@Component({
  selector: 'div.callout-block',
  template: `
    <span class="callout-block__emoji">{{props.emoji}}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.c" contenteditable="true"></div>
  `,
  styles: [`
    :host {
      border: 1px solid transparent;
      padding: 8px 8px 8px 42px;
      border-radius: 4px;
      position: relative;
    }

    .callout-block__emoji {
      position: absolute;
      left: 12px;
      top: 8px;
      font-size: 18px;
      text-indent: 0;
      cursor: pointer;
    }

    .callout-block__emoji:hover {
      background-color: rgba(72, 87, 226, 0.3);
      border-radius: 4px;
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalloutBlock extends EditableBlock<ICalloutBlockModel> {
  @HostBinding('style.backgroundColor')
  protected _backgroundColor: string | null = '#dc9b9b'

  @HostBinding('style.borderColor')
  protected _borderColor: string | null = '#FFE6CD'

  private _toolbarDispose$ = new Subject<boolean>()
  private toolbarOverlayRef?: OverlayRef
  private _colorPickerOverlayRef?: OverlayRef

  constructor(
    private overlay: Overlay
  ) {
    super();
  }

  override ngOnInit() {
    super.ngOnInit();
    this.setStyle();

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if (v.type === 'props') this.setStyle();
    })
  }

  setStyle() {
    this._backgroundColor !== this.props.bc && (this._backgroundColor = this.props.bc);
    this._borderColor !== this.props.ec && (this._borderColor = this.props.ec);
    this.cdr.markForCheck();
  }

  @HostListener('mouseenter')
  showToolbar(e: FocusEvent) {
    if (this.toolbarOverlayRef) return
    this.toolbarOverlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(this.hostEl.nativeElement).withPositions(POSITIONS),
      scrollStrategy: this.overlay.scrollStrategies.close()
    })
    this.toolbarOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeToolbar)
    const cpr = this.toolbarOverlayRef.attach(new ComponentPortal(FloatToolbar))
    cpr.setInput('toolbarList', TOOLBAR_LIST)

    fromEvent<MouseEvent>(this.hostEl.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
      if (!cpr.location.nativeElement.contains(e.relatedTarget)) this.closeToolbar()
    })
    fromEvent<MouseEvent>(cpr.location.nativeElement, 'mouseleave').pipe(takeUntil(this._toolbarDispose$)).subscribe(e => {
      if (e.relatedTarget !== this.hostEl.nativeElement && !(e.relatedTarget as HTMLElement).closest('.cdk-overlay-container')) this.closeToolbar()
    })

    cpr.instance.itemClick.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({item, event}) => {
      switch (item.name) {
        case 'color':
          this.showColorPicker(event.target as HTMLElement)
          break
        case 'copy':
          navigator.clipboard.writeText(this.getTextContent()).then(() => {
            cpr.setInput('toolbarList', COPYED_TOOLBAR_LIST)
            setTimeout(() => {
              cpr.setInput('toolbarList', TOOLBAR_LIST)
            }, 2000)
          })
      }
    })

  }

  showColorPicker(target: HTMLElement) {
    if (this._colorPickerOverlayRef) return
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
      {originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8},
      {originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8},
    ]).withPush(false)
    this._colorPickerOverlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.close()
    })
    this._colorPickerOverlayRef.backdropClick().pipe(take(1)).subscribe(this.closeColorPicker)
    const cpr = this._colorPickerOverlayRef.attach(new ComponentPortal(ColorPalette))
    cpr.setInput('activeColor', this.props.c)
    cpr.setInput('activeBgColor', this.props.bc)
    cpr.setInput('activeEdgeColor', this.props.ec)
    cpr.setInput('showEdgeColor', true)
    cpr.instance.colorChange.pipe(takeUntil(cpr.instance.close)).subscribe(({type, value}) => {
      this.setProp(type, value as any)
    })
  }

  closeToolbar = () => {
    this.toolbarOverlayRef?.dispose()
    this.toolbarOverlayRef = undefined
    this._toolbarDispose$.next(true)
    this.closeColorPicker()
  }

  closeColorPicker = () => {
    this._colorPickerOverlayRef?.dispose()
    this._colorPickerOverlayRef = undefined
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this._toolbarDispose$.next(true);
  }

}
