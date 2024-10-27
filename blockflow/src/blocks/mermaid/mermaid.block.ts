import { Overlay } from '@angular/cdk/overlay';
import { NgForOf } from '@angular/common';
import { Component, ElementRef, TemplateRef, ViewChild } from '@angular/core';
import { EditableBlock } from '@core';
import { TEMPLATE_LIST, ITemplate } from './const'
import { TemplatePortal } from '@angular/cdk/portal';
import { ViewContainerRef } from '@angular/core';
import { IMermaidBlockModel } from './type';
import mermaid from 'mermaid'
import { take } from 'rxjs';

// mermaid.initialize({ startOnLoad: false });
@Component({
  selector: 'div.mermaid',
  standalone: true,
  imports: [
    NgForOf
  ],
  templateUrl: './mermaid.block.html',
  styleUrl: './mermaid.block.scss'
})
export class MermaidBlock extends EditableBlock<IMermaidBlockModel> {

  protected readonly templateList = TEMPLATE_LIST

  @ViewChild('graph', { read: ElementRef }) graph!: ElementRef<HTMLElement>
  @ViewChild('templateListTpl', { read: TemplateRef }) templateListTpl!: TemplateRef<any>

  constructor(
    private overlay: Overlay,
    private vcr: ViewContainerRef
  ) {
    super()
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()
    this.renderGraph()
    this.yText.observe(this.renderGraph)
  }

  renderGraph = async () => {
    if (!this.textLength) return
    const graphDefinition = 'graph TB\n' + this.getTextContent();
    const { svg } = await mermaid.render('graphDiv', graphDefinition);
    this.graph.nativeElement.innerHTML = svg
  }

  onSwitchView() {
    this.setProp('viewMode', this.props.viewMode === 'graph' ? 'text' : 'graph')
    if (this.props.viewMode === 'graph') {
      this.renderGraph()
    }
  }

  onShowTemplateList(e: Event) {
    const target = e.target as HTMLElement
    const portal = new TemplatePortal(this.templateListTpl, this.vcr)
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target).withPositions([
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' }
    ])
    const ovr = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    ovr.backdropClick().pipe(take(1)).subscribe(() => {
      ovr.dispose()
    })
    const tcr = ovr.attach(portal)
  }

  useTemplate(item: ITemplate) {
    this.applyDelta([
      { delete: this.textLength },
      { insert: item.template }
    ])
  }
}
