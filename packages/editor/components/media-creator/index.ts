import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import {IBlockSchemaOptions} from "../../framework";
import {urlRegex} from "../../global";

export type MediaSourceType = 'link' | 'local';

export interface MediaCreatorResult {
  type: MediaSourceType;
  url?: string;
  file?: File;
}

@Component({
  selector: 'media-creator',
  template: `
    <div class="mc-header">
      <div class="mc-icon">
        <i class="bc_icon" [class.bc_shipin]="mediaType === 'video'" [class.bc_yinpin]="mediaType === 'audio'"></i>
      </div>
      <div>
        <h3>{{ schema.metadata.label }}</h3>
        <div class="mc-desc">{{ schema.metadata.description || getDefaultDescription() }}</div>
      </div>
    </div>

    <div class="mc-tabs">
      <button class="mc-tab" [class.active]="activeTab === 'link'" (click)="switchTab('link')">
        <i class="bc_icon bc_lianjie"></i> 链接
      </button>
      <button class="mc-tab" [class.active]="activeTab === 'local'" (click)="switchTab('local')">
        <i class="bc_icon bc_shangchuan"></i> 本地上传
      </button>
    </div>

    <div class="mc-body">
      @if (activeTab === 'link') {
        <div class="mc-input-wrap">
          <input type="text"
                 [placeholder]="getUrlPlaceholder()"
                 (input)="verifyUrl()"
                 (keydown.enter)="trySubmit()"
                 (keydown.escape)="onCancel.emit()"
                 #linkInputElement/>
        </div>
        <div class="mc-hint">{{ getUrlHint() }}</div>
      }

      @if (activeTab === 'local') {
        <div class="mc-upload-area"
             [class.mc-upload-area--dragover]="isDragover"
             (click)="triggerFileInput()"
             (dragover)="onDragOver($event)"
             (dragleave)="isDragover = false"
             (drop)="onDrop($event)">
          <span class="mc-upload-text">点击选择或拖拽文件到此处</span>
          <span class="mc-upload-sub">{{ getFileHint() }}</span>
        </div>
        <input type="file" [accept]="getAcceptType()" (change)="onFileSelected($event)" #fileInputElement
               style="display: none;"/>
        @if (selectedFile) {
          <div class="mc-file-card">
            <div class="mc-file-icon">
              <i class="bc_icon" [class.bc_shipin]="mediaType === 'video'" [class.bc_yinpin]="mediaType === 'audio'"></i>
            </div>
            <div class="mc-file-info">
              <span class="mc-file-name">{{ selectedFile.name }}</span>
              <span class="mc-file-size">{{ formatFileSize(selectedFile.size) }}</span>
            </div>
            <button class="mc-file-remove" (click)="clearFile()">
              <i class="bc_icon bc_guanbi"></i>
            </button>
          </div>
        }
      }
    </div>

    <div class="mc-footer">
      <button class="mc-btn mc-btn--cancel" (mousedown)="onCancel.emit()">取消</button>
      <button class="mc-btn mc-btn--primary" [disabled]="isDisabled" (mousedown)="trySubmit()">确定</button>
    </div>
  `,
  styles: [`
    :host {
      width: 380px;
      display: flex;
      flex-direction: column;
      border-radius: var(--bc-radius-lg, 8px);
      background: var(--bc-bg-primary, #fff);
      box-shadow: var(--bc-shadow-lg, 0 4px 16px rgba(0, 0, 0, 0.2));
      font-size: 14px;
      color: var(--bc-color, #1f2e3c);
      overflow: hidden;
    }

    .mc-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px 12px;

      h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--bc-color, #1f2e3c);
        line-height: 1.3;
      }
    }

    .mc-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--bc-radius-md, 4px);
      background: var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1));
      flex-shrink: 0;

      i {
        font-size: 18px;
        color: var(--bc-active-color, #4857E2);
      }
    }

    .mc-desc {
      margin: 2px 0 0;
      color: var(--bc-color-lighter, #8b9cad);
      font-size: 12px;
      line-height: 1.4;
    }

    .mc-tabs {
      display: flex;
      gap: 4px;
      padding: 0 20px;
      border-bottom: 1px solid var(--bc-border-color-light, #F1F1EF);
    }

    .mc-tab {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      border: none;
      background: none;
      color: var(--bc-color-light, #5f7184);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color var(--bc-transition-fast, 0.15s ease),
                  border-color var(--bc-transition-fast, 0.15s ease);

      i { font-size: 14px; }

      &:hover {
        color: var(--bc-color, #1f2e3c);
      }

      &.active {
        color: var(--bc-active-color, #4857E2);
        border-bottom-color: var(--bc-active-color, #4857E2);
      }
    }

    .mc-body {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mc-input-wrap {
      input {
        width: 100%;
        border-radius: var(--bc-radius-md, 4px);
        border: 1px solid var(--bc-border-color, #E9E9E7);
        padding: 8px 12px;
        font-size: 13px;
        color: var(--bc-color, #1f2e3c);
        background: var(--bc-bg-primary, #fff);
        outline: none;
        transition: border-color var(--bc-transition-fast, 0.15s ease),
                    box-shadow var(--bc-transition-fast, 0.15s ease);
        box-sizing: border-box;

        &:focus {
          border-color: var(--bc-active-color, #4857E2);
          box-shadow: 0 0 0 3px var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1));
        }

        &::placeholder {
          color: var(--bc-placeholder-color, #9B9A97);
        }
      }
    }

    .mc-hint {
      color: var(--bc-color-lighter, #8b9cad);
      font-size: 11px;
      line-height: 1.5;
    }

    .mc-upload-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      border: 2px dashed var(--bc-border-color, #E9E9E7);
      border-radius: var(--bc-radius-lg, 8px);
      cursor: pointer;
      transition: border-color var(--bc-transition-fast, 0.15s ease),
                  background var(--bc-transition-fast, 0.15s ease);
      background: var(--bc-bg-secondary, #fafaf7);

      &:hover, &--dragover {
        border-color: var(--bc-active-color, #4857E2);
        background: var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1));
      }
    }

    .mc-upload-text {
      font-size: 13px;
      font-weight: 500;
      color: var(--bc-color, #1f2e3c);
    }

    .mc-upload-sub {
      font-size: 11px;
      color: var(--bc-color-lighter, #8b9cad);
    }

    .mc-file-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bc-bg-secondary, #fafaf7);
      border: 1px solid var(--bc-border-color-light, #F1F1EF);
      border-radius: var(--bc-radius-md, 4px);
    }

    .mc-file-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--bc-radius-md, 4px);
      background: var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1));
      flex-shrink: 0;

      i {
        font-size: 16px;
        color: var(--bc-active-color, #4857E2);
      }
    }

    .mc-file-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .mc-file-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--bc-color, #1f2e3c);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mc-file-size {
      font-size: 11px;
      color: var(--bc-color-lighter, #8b9cad);
    }

    .mc-file-remove {
      appearance: none;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      border-radius: var(--bc-radius-sm, 2px);
      cursor: pointer;
      color: var(--bc-color-lighter, #8b9cad);
      transition: color var(--bc-transition-fast, 0.15s ease),
                  background var(--bc-transition-fast, 0.15s ease);

      i { font-size: 12px; }

      &:hover {
        color: var(--bc-error-color, #e03131);
        background: var(--bc-error-background-color, rgba(224, 49, 49, 0.1));
      }
    }

    .mc-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--bc-border-color-light, #F1F1EF);
    }

    .mc-btn {
      appearance: none;
      padding: 6px 16px;
      border-radius: var(--bc-radius-md, 4px);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background var(--bc-transition-fast, 0.15s ease),
                  border-color var(--bc-transition-fast, 0.15s ease),
                  opacity var(--bc-transition-fast, 0.15s ease);

      &--cancel {
        border: 1px solid var(--bc-border-color, #E9E9E7);
        background: var(--bc-bg-primary, #fff);
        color: var(--bc-color-light, #5f7184);

        &:hover {
          background: var(--bc-bg-hover, #F1F1EF);
          border-color: var(--bc-border-color-dark, #CCC);
        }
      }

      &--primary {
        border: 1px solid transparent;
        background: var(--bc-active-color, #4857E2);
        color: #fff;

        &:hover:not([disabled]) {
          opacity: 0.85;
        }

        &[disabled] {
          background: var(--bc-bg-hover, #F1F1EF);
          color: var(--bc-color-lighter, #8b9cad);
          cursor: not-allowed;
        }
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MediaCreatorComponent {
  @Input()
  schema!: IBlockSchemaOptions;

  @Input()
  mediaType: 'video' | 'audio' = 'video';

  @Output()
  onSubmit = new EventEmitter<MediaCreatorResult>();

  @Output()
  onCancel = new EventEmitter<void>();

  @ViewChild('linkInputElement', {read: ElementRef})
  linkInputElement?: ElementRef<HTMLInputElement>;

  @ViewChild('fileInputElement', {read: ElementRef})
  fileInputElement?: ElementRef<HTMLInputElement>;

  activeTab: MediaSourceType = 'link';
  isDisabled = true;
  selectedFile: File | null = null;
  isDragover = false;

  constructor(
    public readonly destroyer: DestroyRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.linkInputElement?.nativeElement.focus();
    }, 100);
  }

  switchTab(tab: MediaSourceType) {
    this.activeTab = tab;
    this.isDisabled = true;
    this.selectedFile = null;
    this.cdr.markForCheck();

    setTimeout(() => {
      if (tab === 'link') {
        this.linkInputElement?.nativeElement.focus();
      }
    }, 100);
  }

  getDefaultDescription(): string {
    return this.mediaType === 'video'
      ? '插入视频，支持链接或本地上传'
      : '插入音频，支持链接或本地上传';
  }

  getUrlPlaceholder(): string {
    return this.mediaType === 'video'
      ? 'https://example.com/video.mp4'
      : 'https://example.com/audio.mp3';
  }

  getUrlHint(): string {
    return this.mediaType === 'video'
      ? '支持 MP4、WebM 等视频文件，以及 YouTube、Bilibili、优酷、腾讯视频等平台链接'
      : '支持 MP3、WAV、OGG 等音频文件链接';
  }

  getAcceptType(): string {
    return this.mediaType === 'video' ? 'video/*' : 'audio/*';
  }

  getFileHint(): string {
    return this.mediaType === 'video'
      ? '支持 MP4、WebM、OGG 格式，最大 100MB'
      : '支持 MP3、WAV、OGG 格式，最大 50MB';
  }

  verifyUrl() {
    const url = this.linkInputElement?.nativeElement.value || '';
    this.isDisabled = !this.isValidMediaUrl(url);
    this.cdr.markForCheck();
  }

  isValidMediaUrl(url: string): boolean {
    if (!url?.trim()) return false;

    if (this.mediaType === 'video') {
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
      if (videoExtensions.some(ext => url.toLowerCase().includes(ext))) {
        return urlRegex.test(url);
      }
      return this.isValidVideoPlatformUrl(url);
    } else {
      const audioExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a', '.wma'];
      if (audioExtensions.some(ext => url.toLowerCase().includes(ext))) {
        return urlRegex.test(url);
      }
      return false;
    }
  }

  private isValidVideoPlatformUrl(url: string): boolean {
    const patterns = [
      /youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\//,
      /bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)|b23\.tv\/[a-zA-Z0-9]+/,
      /vimeo\.com\/\d+|player\.vimeo\.com\/video\/\d+/,
      /v\.youku\.com\/v_show\/|youku\.com.*id_/,
      /v\.qq\.com\/(x\/|cover\/)/,
      /iqiyi\.com\/(v_|w_)/,
      /ixigua\.com\/\d+/,
      /douyin\.com\/video\//,
      /tiktok\.com\/@[^\/]+\/video\/|tiktok\.com\/video\//,
      /dailymotion\.com\/video\//,
      /weibo\.com\/tv\/(show|v)\//,
      /tv\.sohu\.com\/v\//,
      /acfun\.cn\/v\//,
    ];
    return patterns.some(p => p.test(url));
  }

  triggerFileInput() {
    this.fileInputElement?.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.handleFile(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragover = true;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragover = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  handleFile(file: File) {
    const maxSize = this.mediaType === 'video' ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      this.selectedFile = null;
      this.isDisabled = true;
      this.cdr.markForCheck();
      return;
    }

    const isValidType = this.mediaType === 'video'
      ? file.type.startsWith('video/')
      : file.type.startsWith('audio/');

    if (!isValidType) {
      this.selectedFile = null;
      this.isDisabled = true;
      this.cdr.markForCheck();
      return;
    }

    this.selectedFile = file;
    this.isDisabled = false;
    this.cdr.markForCheck();
  }

  clearFile() {
    this.selectedFile = null;
    this.isDisabled = true;
    if (this.fileInputElement) {
      this.fileInputElement.nativeElement.value = '';
    }
    this.cdr.markForCheck();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  trySubmit() {
    if (this.isDisabled) return;

    const result: MediaCreatorResult = {
      type: this.activeTab
    };

    switch (this.activeTab) {
      case 'link':
        result.url = this.linkInputElement?.nativeElement.value || '';
        break;
      case 'local':
        result.file = this.selectedFile!;
        break;
    }

    this.onSubmit.emit(result);
  }
}
