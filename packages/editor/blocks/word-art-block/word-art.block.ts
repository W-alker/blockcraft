import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  NgZone,
  ViewChild,
} from '@angular/core'
import {fromEvent, takeUntil} from 'rxjs'
import {EditableBlockComponent} from '../../framework'
import {
  ShapeResizerComponent,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../shape-block'
import type {WordArtBlockModel} from './index'
import {calculateWordArtResize} from './word-art-resize'
import {
  normalizeWordArtProps,
  resolveWordArtPresentation,
  type NormalizedWordArtBlockProps,
  type WordArtBlockProps,
  type WordArtPresentation,
} from './word-art.types'
import {
  mutationAffectsWordArtVector,
  refreshWordArtVectorMirror,
} from '../../framework/modules/pagination/export/print-word-art'

const rotationTransform = (rotation: number): string =>
  rotation === 0 ? '' : `rotate(${rotation}deg)`

@Component({
  selector: 'div.word-art-block',
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #surface
      class="word-art-block__surface"
      data-bc-fake-range-overlay-host
      data-bc-scale-font-on-corner
      [attr.data-bc-resize-preview-anchor]="
        wordArtProps.placement?.mode === 'absolute' ? null : 'layout'
      "
      [style.width.px]="wordArtProps.width"
      [style.height.px]="wordArtProps.height"
      [style.font-size.px]="wordArtProps.fontSize"
      [style.transform]="surfaceTransform"
      [style.align-items]="verticalAlignment"
    >
      <div
        class="word-art-block__editor edit-container"
        [attr.data-bc-word-art-print-props]="printProps"
        [attr.contenteditable]="isReadonly ? 'false' : 'true'"
        [style.font-family]="presentation.fontFamily"
        [style.font-weight]="wordArtProps.fontWeight"
        [style.font-style]="wordArtProps.fontStyle"
        [style.letter-spacing.em]="wordArtProps.letterSpacingEm"
        [style.line-height]="wordArtProps.lineHeight"
        [style.text-align]="wordArtProps.horizontalAlign"
        [style.caret-color]="presentation.fallbackColor"
        [attr.data-bc-word-art-effect-transform]="presentation.effectTransform"
      ></div>
      @if (!isReadonly) {
        <shape-resizer
          [target]="surface"
          [maxWidthContainer]="placementContainer"
          [rotation]="wordArtProps.rotation"
          [borderDraggable]="true"
          [resizeCalculator]="resizeCalculator"
          rotationLabel="旋转艺术字"
          (resizeCommit)="commitResize($event)"
          (rotateCommit)="commitRotation($event)"
        >
        </shape-resizer>
      }
    </div>
  `,
})
export class WordArtBlockComponent extends EditableBlockComponent<WordArtBlockModel> {
  override plainTextOnly = true
  readonly resizeCalculator = calculateWordArtResize
  private readonly _ngZone = inject(NgZone)
  private _vectorFrame = 0
  private _vectorTextObserver?: MutationObserver
  private _vectorSizeObserver?: ResizeObserver

  @ViewChild('surface', {read: ElementRef})
  private readonly _surface?: ElementRef<HTMLElement>

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()
    this._ngZone.runOutsideAngular(() => {
      fromEvent(this.containerElement, 'scroll', {passive: true})
        .pipe(takeUntil(this.onDestroy$))
        .subscribe(() => this._resetEditorScroll())
      this._installVectorRenderer()
    })
  }

  get wordArtProps(): NormalizedWordArtBlockProps {
    return normalizeWordArtProps(this.props)
  }

  get presentation(): WordArtPresentation {
    return resolveWordArtPresentation(this.props)
  }

  /** 打印副本用的确定性视觉参数；分页打印层只消费隔离 DOM，不回写文档模型。 */
  get printProps(): string {
    return JSON.stringify(this.wordArtProps)
  }

  get surfaceTransform(): string {
    return rotationTransform(this.wordArtProps.rotation)
  }

  get verticalAlignment(): 'flex-start' | 'center' | 'flex-end' {
    if (this.wordArtProps.verticalAlign === 'top') return 'flex-start'
    if (this.wordArtProps.verticalAlign === 'bottom') return 'flex-end'
    return 'center'
  }

  get surfaceElement(): HTMLElement {
    return (
      this._surface?.nativeElement ??
      this.hostElement.querySelector<HTMLElement>('.word-art-block__surface') ??
      this.hostElement
    )
  }

  get placementContainer(): HTMLElement | undefined {
    return (
      this.hostElement.closest<HTMLElement>('[data-bc-placement-container]') ??
      this.hostElement.parentElement ??
      undefined
    )
  }

  enterEditing(selectAll = false): void {
    if (this.isReadonly) return
    this.setInlineRange(
      selectAll ? 0 : this.textLength,
      selectAll ? this.textLength : 0,
    )
  }

  commitResize(event: ShapeResizeCommit): void {
    if (this.isReadonly) return
    const current = this.wordArtProps
    const isCorner =
      (event.handle.includes('east') || event.handle.includes('west')) &&
      (event.handle.includes('north') || event.handle.includes('south'))
    const next: Partial<WordArtBlockProps> = {
      width: Math.round(event.width),
      height: Math.round(event.height),
      ...(isCorner
        ? {
            fontSize:
              (current.fontSize * event.width) / Math.max(1, current.width),
          }
        : {}),
    }

    if (current.placement?.mode === 'absolute') {
      const containerWidth = this.placementContainer?.clientWidth ?? 0
      next.placement = {
        ...current.placement,
        x:
          (current.placement.x ?? 0) +
          (containerWidth > 0 ? (event.offsetX / containerWidth) * 100 : 0),
        y: (current.placement.y ?? 0) + event.offsetY,
      }
    }
    this.updateProps(next)
    const surface = this._surface?.nativeElement
    if (surface) {
      surface.style.transform = rotationTransform(current.rotation)
      if (isCorner && next.fontSize != null) {
        surface.style.fontSize = `${next.fontSize}px`
      }
    }
  }

  commitRotation(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    this.updateProps({rotation: event.rotation})
    const surface = this._surface?.nativeElement
    if (surface) {
      surface.style.transform = rotationTransform(event.rotation)
    }
  }

  private _resetEditorScroll(): void {
    const editor = this.containerElement
    if (editor.scrollTop !== 0) editor.scrollTop = 0
    if (editor.scrollLeft !== 0) editor.scrollLeft = 0
  }

  private _installVectorRenderer(): void {
    const editor = this.containerElement
    const surface = this.surfaceElement
    const schedule = () => {
      // 内容、尺寸、属性或字体只要进入下一轮 SVG 计算，当前镜像就不再代表
      // 可导出的稳定布局。分页稳定等待会观察到该属性变化，并等新镜像 ready。
      surface.removeAttribute('data-bc-word-art-vector-ready')
      if (this._vectorFrame) return
      this._vectorFrame = requestAnimationFrame(() => {
        this._vectorFrame = 0
        refreshWordArtVectorMirror(editor)
      })
    }

    this._vectorTextObserver = new MutationObserver(mutations => {
      if (mutationAffectsWordArtVector(mutations)) schedule()
    })
    this._vectorTextObserver.observe(editor, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    this._vectorSizeObserver = new ResizeObserver(schedule)
    this._vectorSizeObserver.observe(editor)
    this.onPropsChange
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(schedule)

    const fonts = editor.ownerDocument.fonts
    const onFontsLoaded = () => schedule()
    fonts?.addEventListener?.('loadingdone', onFontsLoaded)
    this.destroyRef.onDestroy(() => {
      if (this._vectorFrame) cancelAnimationFrame(this._vectorFrame)
      this._vectorFrame = 0
      this._vectorTextObserver?.disconnect()
      this._vectorSizeObserver?.disconnect()
      fonts?.removeEventListener?.('loadingdone', onFontsLoaded)
    })
    schedule()
  }
}
