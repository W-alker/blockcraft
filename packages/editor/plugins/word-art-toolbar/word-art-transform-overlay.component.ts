import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  calculateWordArtResize,
} from '../../blocks/word-art-block'
import {
  ShapeResizerComponent,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../../blocks/shape-block'

@Component({
  selector: 'bc-word-art-transform-overlay',
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="word-art-transform-overlay__anchor">
      <div
        #previewMirror
        class="word-art-transform-overlay__layer"
        [style.width.px]="wordArtBlock.wordArtProps.width"
        [style.height.px]="wordArtBlock.wordArtProps.height"
        [style.transform]="wordArtBlock.surfaceTransform">
        <shape-resizer
          style="display: block"
          [target]="wordArtBlock.surfaceElement"
          [previewMirror]="previewMirror"
          [maxWidthContainer]="wordArtBlock.placementContainer"
          [rotation]="wordArtBlock.wordArtProps.rotation"
          [resizeCalculator]="resizeCalculator"
          rotationLabel="旋转艺术字"
          (resizeCommit)="resizeCommit.emit($event)"
          (rotateCommit)="rotateCommit.emit($event)">
        </shape-resizer>
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      width: 0;
      height: 0;
      overflow: visible;
      pointer-events: none;
    }

    .word-art-transform-overlay__anchor {
      position: absolute;
      top: 0;
      left: 0;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .word-art-transform-overlay__layer {
      position: relative;
      box-sizing: border-box;
      transform-origin: center center;
      pointer-events: none;
    }
  `],
})
export class WordArtTransformOverlayComponent {
  @Input({required: true})
  wordArtBlock!: BlockCraft.IBlockComponents['word-art']

  @Output()
  readonly resizeCommit = new EventEmitter<ShapeResizeCommit>()

  @Output()
  readonly rotateCommit = new EventEmitter<ShapeRotateCommit>()

  readonly resizeCalculator = calculateWordArtResize
}
