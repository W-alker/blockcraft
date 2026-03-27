import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core';
import {BaseBlockComponent, DOC_FILE_SERVICE_TOKEN, DocFileService} from '../../framework';
import {ImageBlockModel} from './index';
import {AsyncPipe} from '@angular/common';
import {ResizeContainerComponent} from '../../components/block-resizer';

@Component({
  selector: 'div.image-block',
  template: `
    <figure class="image-block__container" [attr.data-align]="props.align">
      <div class="img-wrapper">
        @if (!props.src) {
          <div class="upload-hint" contenteditable="false" (click)="inputLocalFile()">
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
               [style.width.px]="props.width"
               loading="lazy"
               contenteditable="false"
               [draggable]="!(doc.readonlySwitch$ | async)"
               #imgEle/>
          @if (!(doc.readonlySwitch$ | async)) {
            <block-resizer [container]="imgEle"
                           [maxWidthContainer]="hostElement"
                           (widthChange)="onResized($event)"/>
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
  imports: [AsyncPipe, ResizeContainerComponent],
  host: {
    '[attr.data-align]': 'props.align'
  },
  styles: [`
    :host {
      img {
        width: 100%;
      }
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

      &__spinner {
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
  @ViewChild('imgEle')
  imgEle!: ElementRef<HTMLImageElement>;

  protected uploadProgress = 100;
  protected _previewUri = '';

  private _fileService?: DocFileService;

  private get fileService() {
    return this._fileService ??= this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN);
  }

  get isPeerUploading(): boolean {
    const src = this.props.src;
    return !!src && this.fileService.isLocalObjectURL(src) && !this.fileService.getFileByObjectURL(src);
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

    if (this.props.src && !this.props.width && this.imgEle) {
      const img = this.imgEle.nativeElement;
      img.addEventListener('load', () => {
        this.setInitProps({width: img.naturalWidth, height: img.naturalHeight});
      }, {once: true});
    }
  }

  inputLocalFile = async () => {
    try {
      const files = await this.fileService.inputFiles('image/*');
      if (!files || files.length === 0) return;
      const file = files[0];

      if (this.fileService.isOverMaxSize(file.size)) {
        this.doc.messageService.warn('图片过大，最大支持 60MB');
        return;
      }

      const url = this.fileService.createObjectURL(file);
      this.setInitProps({src: url});
      this.uploadImage(url);
    } catch (e) {
      console.error('选择图片失败', e);
    }
  };

  uploadImage(url: string) {
    if (!this.fileService.isLocalObjectURL(url)) return;

    const file = this.fileService.getFileByObjectURL(url);
    if (!file) return;

    this._previewUri = this.fileService.getFilePreviewURLByObjectURL(url);
    this.uploadProgress = 0;
    this.changeDetectorRef.markForCheck();

    this.fileService.uploadImg(file, (p) => {
      this.uploadProgress = p;
      this.changeDetectorRef.detectChanges();
    }).then(resultUrl => {
      this.fileService.removeObjectURL(url);
      this.setInitProps({src: resultUrl});
      this.uploadProgress = 100;
      this._previewUri = '';
      this.changeDetectorRef.markForCheck();
    }).catch(() => {
      this.fileService.removeObjectURL(url);
      this.doc.messageService.warn('图片上传失败');
      this.setInitProps({src: ''});
      this.uploadProgress = 100;
      this._previewUri = '';
      this.changeDetectorRef.markForCheck();
    });
  }

  onResized(width: number) {
    this.updateProps({width});
    this.changeDetectorRef.markForCheck();
  }
}
