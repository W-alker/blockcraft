import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core';
import {
  BaseBlockComponent,
  deriveObjectSizeFromPixels,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
} from '../../framework';
import {ImageBlockModel} from './index';
import {
  BcResourcePlaceholderDirective,
  BlockResizeCommit,
  ResourceIntrinsicSize,
  ResizeContainerComponent,
} from '../../components';
import {takeUntil} from 'rxjs';

export function deriveInitialImageObjectSize(
  size: ResourceIntrinsicSize,
  parentAvailableWidth: number,
  rootContentWidth: number,
  preferredWidth = size.width,
): {wr: number; ar: number} | null {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    !Number.isFinite(parentAvailableWidth) ||
    parentAvailableWidth <= 0
  ) {
    return null
  }
  const sourceWidth = Number.isFinite(preferredWidth) && preferredWidth > 0
    ? preferredWidth
    : size.width
  const displayWidth = Math.min(sourceWidth, parentAvailableWidth)
  const ar = size.width / size.height
  const derived = deriveObjectSizeFromPixels(
    displayWidth,
    displayWidth / ar,
    rootContentWidth,
  )
  return derived ? {wr: derived.wr, ar} : null
}

@Component({
  selector: 'div.image-block',
  template: `
    <figure class="image-block__container" [attr.data-align]="props.align">
      <div
        class="img-wrapper"
        data-bc-print-visual-surface
        #imgWrapper
        bcResourcePlaceholder
        [resourceKey]="resourcePreviewUrl"
        (resourceIntrinsicSize)="onImageIntrinsicSize($event)"
        [style.width.px]="renderedWidth"
        [style.aspect-ratio]="renderedAspectRatio"
        [attr.data-bc-object-sizing]="usesRatioSizing ? '' : null">
        @if (!props.src) {
          <div class="upload-hint" contenteditable="false" (click)="!isReadonly && inputLocalFile()">
            <i class="bc_icon bc_tianjiatupian"></i>
            <span>点击插入图片</span>
          </div>
        } @else if (isPeerUploading) {
          <div class="peer-uploading" contenteditable="false">
            <div class="peer-uploading__spinner"></div>
            <span>同步中...</span>
          </div>
        } @else {
          <img [src]="_previewUri || props.src"
               loading="lazy"
               contenteditable="false"
               draggable="false"/>
          @if (!isReadonly) {
            <block-resizer
              [container]="imgWrapper"
              [maxWidthContainer]="resizeMaxWidthContainer"
              [referenceWidth]="referenceWidth || undefined"
              [preserveRightEdge]="isAbsolute"
              (resizeCommit)="onResized($event)"/>
          }
        }
        @if (uploadProgress !== 100) {
          <div class="upload-progress-overlay" contenteditable="false">
            <div class="upload-progress-bar">
              <div class="upload-progress-fill" [style.width.%]="uploadProgress"></div>
            </div>
          </div>
        }
      </div>

      <div class="children-render-container"></div>
    </figure>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResizeContainerComponent, BcResourcePlaceholderDirective],
  host: {
    '[attr.data-align]': 'props.align'
  },
  styles: [`
    :host {
      img {
        width: 100%;
      }
    }

    .img-wrapper {
      max-width: 100%;
    }

    .image-block__container {
      max-width: 100%;
    }

    /* Keep the ratio wrapper as the sole layout box. WebKit table cells can
       otherwise resolve the image's percentage height to its intrinsic pixels. */
    .img-wrapper[data-bc-object-sizing] > img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .upload-hint, .peer-uploading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80px;
      padding: 0 8px;
      border: 2px dashed var(--bc-border-color, #e0e0e0);
      border-radius: 8px;
      transition: all 0.2s;
      background: var(--bc-bg-secondary, #fafafa);
    }

    .upload-hint {
      cursor: pointer;

      &:hover {
        border-color: var(--bc-active-color, #4857E2);
        background: var(--bc-bg-hover, #f5f5f5);
      }

      i {
        font-size: 28px;
        color: var(--bc-color-light, #999);
        margin-bottom: 8px;
      }

      span {
        color: var(--bc-color-secondary, #666);
        font-size: 14px;
      }
    }

    .peer-uploading {
      gap: 10px;
      border-style: solid;
      border-color: var(--bc-border-color-light, #F1F1EF);

      span {
        color: var(--bc-color-lighter, #8b9cad);
        font-size: 13px;
      }

      .peer-uploading__spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--bc-border-color, #E9E9E7);
        border-top-color: var(--bc-active-color, #4857E2);
        border-radius: 50%;
        animation: bc-spin 0.8s linear infinite;
      }
    }

    @keyframes bc-spin {
      to { transform: rotate(360deg); }
    }

    .upload-progress-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(2px);
      z-index: 10;

      .upload-progress-bar {
        width: 80px;
        height: 6px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 3px;
        overflow: hidden;

        .upload-progress-fill {
          height: 100%;
          background: #fff;
          border-radius: 3px;
          transition: width 0.2s;
        }
      }
    }
  `]
})
export class ImageBlockComponent extends BaseBlockComponent<ImageBlockModel> {
  @ViewChild('imgWrapper')
  imgWrapper!: ElementRef<HTMLElement>;

  protected uploadProgress = 100;
  protected _previewUri = '';

  private _fileService?: DocFileService;
  private _awaitingLocalPreviewSize = false
  private _pendingIntrinsicSize: ResourceIntrinsicSize | null = null

  private get fileService() {
    return this._fileService ??= this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN);
  }

  get isPeerUploading(): boolean {
    const src = this.props.src;
    return !!src && this.fileService.isLocalObjectURL(src) && !this.fileService.getFileByObjectURL(src);
  }

  get objectDimensions() {
    return this.doc.objectSizing.resolveForBlock(this.id, this.flavour, this.props)
  }

  get renderedWidth(): number | null {
    const width = this.objectDimensions?.width
    if (width == null) return null
    const referenceWidth = this.referenceWidth
    return Number.isFinite(referenceWidth) && referenceWidth > 0
      ? Math.min(width, referenceWidth)
      : width
  }

  get renderedAspectRatio(): string | null {
    const dimensions = this.objectDimensions
    return dimensions && dimensions.source !== 'legacy'
      ? `${dimensions.ar}`
      : null
  }

  get usesRatioSizing(): boolean {
    const dimensions = this.objectDimensions
    return !!dimensions && dimensions.source !== 'legacy'
  }

  get rootContentWidth(): number {
    return this.doc.objectSizing.rootContentWidth
  }

  get referenceWidth(): number {
    return this.doc.objectSizing.getReferenceWidth(this.id)
  }

  get isAbsolute(): boolean {
    return this.doc.placement?.isInAbsoluteLayout?.(this.id) ?? false
  }

  get resizeMaxWidthContainer(): HTMLElement {
    if (this.doc.placement?.isInObjectGroup?.(this.id)) {
      const groupHost = this.hostElement.closest<HTMLElement>('[data-bc-object-group]')
      return this.doc.objectSizing.rootContentElement ?? groupHost?.parentElement ?? this.hostElement
    }
    return this.isAbsolute
      ? this.doc.objectSizing.rootContentElement ?? this.hostElement
      : this.hostElement
  }

  get resourcePreviewUrl(): string {
    return this._previewUri || this.props.src
  }

  override ngOnInit() {
    super.ngOnInit();
    if (!this.props.src) return;

    if (!this.props.src.startsWith('http') && !this.props.src.startsWith('data:')) {
      this.uploadImage(this.props.src);
    }
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.doc.objectSizing.widthChange$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(() => {
        if (this.doc.placement?.isInObjectGroup?.(this.id)) return
        this.commitPendingIntrinsicSize()
        this.changeDetectorRef.markForCheck()
      })
  }

  onImageIntrinsicSize(size: ResourceIntrinsicSize) {
    if (
      this._isGone() ||
      this.isReadonly
    ) {
      return
    }
    this._pendingIntrinsicSize = size
    this.commitPendingIntrinsicSize()
  }

  inputLocalFile = async () => {
    if (this.isReadonly) return;
    try {
      const files = await this.fileService.inputFiles('image/*');
      if (this._isGone() || this.isReadonly) return;
      if (!files || files.length === 0) return;
      const file = files[0];

      if (this.fileService.isOverMaxSize(file.size)) {
        this.doc.messageService.warn('图片过大，最大支持 60MB');
        return;
      }

      const url = this.fileService.createObjectURL(file);
      this.setInitProps({
        src: url,
        wr: 100,
        ar: null,
        width: null,
        height: null,
      });
      this.uploadImage(url);
    } catch (e) {
      console.error('选择图片失败', e);
    }
  };

  uploadImage(url: string) {
    if (!this.fileService.isLocalObjectURL(url)) return;

    const file = this.fileService.getFileByObjectURL(url);
    if (!file) return;

    const hasLegacyWidth =
      typeof this.props.width === 'number' &&
      Number.isFinite(this.props.width) &&
      this.props.width > 0
    const hasCustomWr =
      typeof this.props.wr === 'number' &&
      Number.isFinite(this.props.wr) &&
      this.props.wr > 0 &&
      this.props.wr !== 100
    this._awaitingLocalPreviewSize =
      this.props.ar == null && !hasLegacyWidth && !hasCustomWr
    this._pendingIntrinsicSize = null
    this._previewUri = this.fileService.getFilePreviewURLByObjectURL(url);
    this.uploadProgress = 0;
    this.changeDetectorRef.markForCheck();

    this.fileService.uploadImg(file, (p) => {
      // 上传期间块可能被本地/远端删除：detectChanges on destroyed view 会抛错
      if (this._isGone() || this.isReadonly) return;
      this.uploadProgress = p;
      this.changeDetectorRef.detectChanges();
    }).then(resultUrl => {
      this.fileService.removeObjectURL(url);
      // 块已删：跳过 setInitProps（否则写入 detached Y.Map，undo 时复活孤儿块）
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({src: resultUrl});
      this.uploadProgress = 100;
      this._previewUri = '';
      this.changeDetectorRef.markForCheck();
    }).catch(() => {
      this.fileService.removeObjectURL(url);
      this.doc.messageService.warn('图片上传失败');
      if (this._isGone() || this.isReadonly) return;
      this._awaitingLocalPreviewSize = false
      this._pendingIntrinsicSize = null
      this.setInitProps({
        src: '',
        wr: 100,
        ar: null,
        width: null,
        height: null,
      });
      this.uploadProgress = 100;
      this._previewUri = '';
      this.changeDetectorRef.markForCheck();
    });
  }

  onResized(event: BlockResizeCommit) {
    if (this.isReadonly) return
    const derived = deriveObjectSizeFromPixels(
      event.width,
      event.height,
      event.basisWidth,
    )
    if (!derived) return
    const currentAr =
      typeof this.props.ar === 'number' &&
      Number.isFinite(this.props.ar) &&
      this.props.ar > 0
        ? this.props.ar
        : derived.ar
    const placement = this.doc.placement.getState(this)
    this._awaitingLocalPreviewSize = false
    this._pendingIntrinsicSize = null
    this.doc.placement.updateObjectGeometry(this, {
      wr: derived.wr,
      ar: currentAr,
      width: null,
      height: null,
      ...(placement.mode === 'absolute' && event.offsetX !== 0
        ? {
            position: {
              x: placement.x + event.offsetX,
              y: placement.y,
            },
          }
        : {}),
    });
    this.changeDetectorRef.markForCheck();
  }

  private commitPendingIntrinsicSize(): boolean {
    const size = this._pendingIntrinsicSize
    if (
      !size ||
      this._isGone() ||
      this.isReadonly
    ) {
      return false
    }
    const currentWr =
      typeof this.props.wr === 'number' &&
      Number.isFinite(this.props.wr) &&
      this.props.wr > 0
        ? this.props.wr
        : null
    const currentAr =
      typeof this.props.ar === 'number' &&
      Number.isFinite(this.props.ar) &&
      this.props.ar > 0
        ? this.props.ar
        : null
    if (currentWr !== null && currentAr !== null) {
      this._awaitingLocalPreviewSize = false
      this._pendingIntrinsicSize = null
      return false
    }
    const shouldDeriveWr = this._awaitingLocalPreviewSize || currentWr === null
    if (!shouldDeriveWr) {
      this._pendingIntrinsicSize = null
      if (currentAr !== null) return false
      this.setInitProps({ar: size.ar})
      return true
    }

    const legacyWidth =
      typeof this.props.width === 'number' &&
      Number.isFinite(this.props.width) &&
      this.props.width > 0
        ? this.props.width
        : undefined
    const initialSize = deriveInitialImageObjectSize(
      size,
      this.initialAvailableWidth,
      this.referenceWidth,
      legacyWidth,
    )
    if (!initialSize) return false
    const hasLegacyWidth = Object.prototype.hasOwnProperty.call(
      this.props,
      'width',
    )
    const hasLegacyHeight = Object.prototype.hasOwnProperty.call(
      this.props,
      'height',
    )
    this.setInitProps({
      wr: initialSize.wr,
      ar: currentAr ?? initialSize.ar,
      ...(hasLegacyWidth ? {width: null} : {}),
      ...(hasLegacyHeight ? {height: null} : {}),
    })
    this._awaitingLocalPreviewSize = false
    this._pendingIntrinsicSize = null
    return true
  }

  /** 首次 wr/ar 迁移只读取未缩放的 layout 宽度。 */
  private get initialAvailableWidth(): number {
    const referenceWidth = this.referenceWidth
    if (this.isAbsolute) return referenceWidth
    const hostWidth = this.hostElement.clientWidth
    if (!Number.isFinite(hostWidth) || hostWidth <= 0) return referenceWidth
    if (!Number.isFinite(referenceWidth) || referenceWidth <= 0) return hostWidth
    // CSS zoom 可能让 auto-width 图片宿主的 clientWidth 反向扩张；root
    // content width 是响应式 wr 的权威分母，也同时是顶层图片的最大可用宽度。
    return Math.min(hostWidth, referenceWidth)
  }
}
