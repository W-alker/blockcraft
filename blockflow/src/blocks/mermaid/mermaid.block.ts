import { Component, ElementRef, ViewChild } from '@angular/core';
import { EditableBlock } from '@core';
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false });
@Component({
  selector: 'div.mermaid',
  standalone: true,
  imports: [],
  templateUrl: './mermaid.block.html',
  styleUrl: './mermaid.block.scss'
})
export class MermaidBlock extends EditableBlock {

  @ViewChild('graph', { read: ElementRef }) graph!: ElementRef<HTMLElement>

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()

    this.yText.observe(this.renderGraph)
  }

  renderGraph = async () => {
    const graphDefinition = 'graph TB\n' + this.getTextContent();
    const { svg } = await mermaid.render('graphDiv', graphDefinition);
  }
}
