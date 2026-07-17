import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core';
import {BaseBlockComponent, DOC_FILE_SERVICE_TOKEN, DocFileService} from '../../framework';
import {AudioBlockModel} from './index';

@Component({
  selector: 'div.audio-block',
  template: `
    @if (!props.url) {
      <div class="upload-hint" contenteditable="false" (click)="!isReadonly && inputLocalFile()">
        <i class="bc_icon bc_yinpin"></i>
        <span>点击插入音频</span>
      </div>
    } @else if (isPeerUploading) {
      <div class="peer-uploading" contenteditable="false">
        <div class="peer-uploading__spinner"></div>
        <span>同步中...</span>
      </div>
    } @else {
      <div class="audio-block__wrapper">
        <div class="audio-player">
          <div class="audio-info">
            @if (props.name) {
              <div class="audio-name">{{ props.name }}</div>
            }
            <audio #audioElement [src]="props.url" controls preload="metadata">
              您的浏览器不支持音频播放
            </audio>
          </div>
          @if (uploadProgress < 100 && uploadProgress >= 0) {
            <div class="upload-progress">
              <div class="upload-progress-bar">
                <div class="upload-progress-fill" [style.width.%]="uploadProgress"></div>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./audio-block.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioBlockComponent extends BaseBlockComponent<AudioBlockModel> {
  @ViewChild('audioElement', {read: ElementRef})
  audioElement?: ElementRef<HTMLAudioElement>;

  protected uploadProgress = 100;

  private _fileService?: DocFileService;

  private get fileService() {
    return this._fileService ??= this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN);
  }

  get isPeerUploading(): boolean {
    const url = this.props.url;
    return !!url && this.fileService.isLocalObjectURL(url) && !this.fileService.getFileByObjectURL(url);
  }

  override ngOnInit() {
    super.ngOnInit();

    if (this.props.url && this.props.sourceType === 'local') {
      if (!this.props.url.startsWith('http')) {
        this.uploadFile(this.props.url);
      }
    }
  }

  inputLocalFile = async () => {
    if (this.isReadonly) return;
    try {
      const files = await this.fileService.inputFiles('audio/*');
      if (this._isGone() || this.isReadonly) return;
      if (!files || files.length === 0) return;
      const file = files[0];

      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        this.doc.messageService.warn('音频文件过大，最大支持 50MB');
        return;
      }

      const url = this.fileService.createObjectURL(file);
      this.setInitProps({
        name: file.name,
        size: file.size,
        sourceType: 'local',
        url
      });
      this.uploadFile(url);
    } catch (e) {
      console.error('选择音频文件失败', e);
    }
  };

  uploadFile(url: string) {
    if (!this.fileService.isLocalObjectURL(url)) return;

    const file = this.fileService.getFileByObjectURL(url);
    if (!file) return; // 协同端上传，不处理

    this.uploadProgress = 0;
    this.changeDetectorRef.markForCheck();

    this.fileService.uploadAttachment(file, (p) => {
      // 上传期间块可能被本地/远端删除：detectChanges on destroyed view 会抛错
      if (this._isGone() || this.isReadonly) return;
      this.uploadProgress = p;
      this.changeDetectorRef.detectChanges();
    }).then(info => {
      this.fileService.removeObjectURL(url);
      // 块已删：跳过 setInitProps（否则写入 detached Y.Map，undo 时复活孤儿块）
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({
        url: info.url,
        name: info.name,
        size: info.size,
      });
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    }).catch(() => {
      this.fileService.removeObjectURL(url);
      this.doc.messageService.warn('音频上传失败');
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({url: '', name: '', size: 0});
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    });
  }
}
