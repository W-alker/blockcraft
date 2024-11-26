import {Overlay, OverlayRef} from '@angular/cdk/overlay';
import {NgForOf} from '@angular/common';
import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, TemplateRef, ViewChild} from '@angular/core';
import {DeltaOperation, EditableBlock} from '../../core';
import {TEMPLATE_LIST, ITemplate} from './const'
import {TemplatePortal} from '@angular/cdk/portal';
import {ViewContainerRef} from '@angular/core';
import {IMermaidBlockModel} from './type';
import mermaid from 'mermaid'
import {take} from 'rxjs';
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

mermaid.initialize({startOnLoad: false})

@Component({
  selector: 'div.mermaid',
  standalone: true,
  imports: [
    NgForOf
  ],
  templateUrl: './mermaid.block.html',
  styleUrl: './mermaid.block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MermaidBlock extends EditableBlock<IMermaidBlockModel> {

  protected readonly templateList = TEMPLATE_LIST

  @ViewChild('graph', {read: ElementRef}) graph!: ElementRef<HTMLElement>
  @ViewChild('templateListTpl', {read: TemplateRef}) templateListTpl!: TemplateRef<any>

  @HostBinding('attr.data-view-mode')
  protected _viewMode = 'text'

  private modalRef?: OverlayRef

  constructor(
    private overlay: Overlay,
    private vcr: ViewContainerRef
  ) {
    super()
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if (v.type === 'props' && this._viewMode !== this.props.view) {
        this._viewMode = this.props.view
        if (this.props.view === 'graph') {
          this.renderGraph()
        } else {
          this.graph.nativeElement.innerHTML = ''
        }
        this.cdr.markForCheck()
      }
    })
  }

  renderGraph = async () => {
    // console.time('renderGraph')
    if (!this.textLength) return
    const graphDefinition = this.getTextContent();
    const verify = await mermaid.parse(graphDefinition, {suppressErrors: true})
    if (verify) {
      const {svg} = await mermaid.render(this.id.replace(/\d/g, '') + 'graphDiv', graphDefinition);
      this.graph.nativeElement.innerHTML = svg
    } else {
      this.graph.nativeElement.innerHTML = `<span style="color: red;">语法错误！</span>`
    }
    // console.timeEnd('renderGraph')
  }

  onSwitchView() {
    this.setProp('view',  this._viewMode === 'graph' ? 'text' : 'graph')
  }

  private dialogFlag: 'template' | 'prefix' = 'template'

  onShowTemplateList(e: Event, flag: 'template' | 'prefix') {
    const target = e.target as HTMLElement
    const portal = new TemplatePortal(this.templateListTpl, this.vcr)
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
      {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top'}
    ])
    this.modalRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    this.modalRef.backdropClick().pipe(take(1)).subscribe(() => {
      this.modalRef?.dispose()
    })
    this.modalRef.attach(portal)
    this.dialogFlag = flag
  }

  useTemplate(item: ITemplate) {
    if (this.dialogFlag === 'template') {
      const deltas: DeltaOperation[] = [{insert: item.prefix + item.template}]
      if (this.textLength) {
        deltas.unshift({delete: this.textLength})
      }
      this.applyDelta(deltas)
    } else {
      this.applyDelta([
        {insert: item.prefix}
      ])
    }
    this.modalRef?.dispose()
  }
}
