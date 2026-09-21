import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core'
import {Subject} from 'rxjs'

@Component({
  selector: 'bc-column-drag-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #preview class="bc-column-reorder-preview"></div><div #line class="bc-column-reorder-line"></div>`,
  host: {'aria-hidden': 'true'},
  styles: [`
    :host { position: fixed; top: 0; left: 0; pointer-events: none; }
    div { position: absolute; top: 0; left: 0; pointer-events: none; display: none; box-sizing: border-box; }
    .bc-column-reorder-preview {
      background: var(--bc-select-background-color); opacity: .5;
      border: 1px solid var(--bc-active-color); border-radius: 2px;
    }
    .bc-column-reorder-line { width: 2px; background: var(--bc-active-color); border-radius: 1px; }
  `],
})
class ColumnDragPreviewComponent {
  @ViewChild('preview', {static: true}) preview!: ElementRef<HTMLElement>
  @ViewChild('line', {static: true}) line!: ElementRef<HTMLElement>
}

/** 子栏专属的纯视觉投影。视口坐标不受填写区裁剪或文档缩放影响。 */
export class ColumnDragPreview {
  private readonly close$ = new Subject<void>()
  private readonly component: ColumnDragPreviewComponent

  constructor(doc: BlockCraft.Doc) {
    const {componentRef, overlayRef} = doc.overlayService.createGlobalOverlay<ColumnDragPreviewComponent>({
      component: ColumnDragPreviewComponent, left: '0', top: '0',
    }, this.close$)
    overlayRef.overlayElement.style.pointerEvents = 'none'
    componentRef.changeDetectorRef.detectChanges()
    this.component = componentRef.instance
  }

  update(bounds: DOMRect, source: DOMRect, x: number, dropX?: number) {
    const width = Math.min(source.width, bounds.width)
    const left = Math.max(bounds.left, Math.min(x - width / 2, bounds.right - width))
    const preview = this.component.preview.nativeElement
    preview.style.display = 'block'
    preview.style.transform = `translate3d(${left}px, ${source.top}px, 0)`
    preview.style.width = `${width}px`
    preview.style.height = `${source.height}px`
    const line = this.component.line.nativeElement
    line.style.display = dropX === undefined ? 'none' : 'block'
    if (dropX !== undefined) {
      line.style.transform = `translate3d(${Math.max(bounds.left, Math.min(dropX - 1, bounds.right - 2))}px, ${source.top}px, 0)`
      line.style.height = `${source.height}px`
    }
  }

  hide() {
    this.component.preview.nativeElement.style.display = 'none'
    this.component.line.nativeElement.style.display = 'none'
  }

  destroy() {
    this.close$.next()
    this.close$.complete()
  }
}
