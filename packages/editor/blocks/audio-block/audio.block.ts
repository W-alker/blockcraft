import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core';
import {CsButtonComponent} from '@cses/ui';
import {BaseBlockComponent, DOC_FILE_SERVICE_TOKEN, DocFileService} from '../../framework';
import {AudioBlockModel} from './index';

@Component({
  selector: 'div.audio-block',
  template: `
    @if (!props.url) {
      <div class="upload-hint" contenteditable="false" (click)="!isReadonly && inputLocalFile()">
        <i class="bc_icon bc_yinpin" aria-hidden="true"></i>
        <span>点击插入音频</span>
      </div>
    } @else if (isPeerUploading) {
      <div class="peer-uploading" contenteditable="false">
        <div class="peer-uploading__spinner"></div>
        <div class="peer-uploading__copy">
          <div class="audio-heading">
            <i class="audio-heading__icon bc_icon bc_yinpin" aria-hidden="true"></i>
            <span class="audio-name">{{ props.name || '音频' }}</span>
          </div>
          <span class="audio-status">正在同步音频</span>
        </div>
      </div>
    } @else {
      <div
        class="audio-block__wrapper"
        contenteditable="false"
        [attr.aria-busy]="isUploading ? 'true' : null">
        <div class="audio-heading">
          <i class="audio-heading__icon bc_icon bc_yinpin" aria-hidden="true"></i>
          <span class="audio-name" [title]="props.name || '音频'">{{ props.name || '音频' }}</span>
          <span class="audio-status" [class.audio-status--error]="hasAudioError">
            {{ hasAudioError ? '无法播放' : formatTime(duration) }}
          </span>
        </div>

        <div class="audio-player">
          <button
            class="audio-player__button audio-player__button--primary"
            type="button"
            cs-button
            csType="primary"
            csSize="sm"
            csShape="circle"
            [csIcon]="isPlaying ? 'pause-bold' : 'play-bold'"
            [disabled]="playerDisabled"
            [attr.aria-label]="isPlaying ? '暂停音频' : '播放音频'"
            [attr.title]="isPlaying ? '暂停' : '播放'"
            (click)="$event.stopPropagation(); togglePlay()">
          </button>

          <span class="audio-player__time audio-player__time--current">{{ formatTime(currentTime) }}</span>
          <input
            class="audio-player__seek"
            type="range"
            min="0"
            step="0.01"
            [max]="duration || 0"
            [value]="currentTime"
            [style.--audio-progress]="playbackPercent + '%'"
            [disabled]="playerDisabled || duration <= 0"
            aria-label="音频播放进度"
            (input)="seekTo($event)" />
          <span class="audio-player__time">{{ formatTime(duration) }}</span>

          <button
            class="audio-player__button audio-player__button--volume"
            type="button"
            cs-button
            csType="text"
            csSize="sm"
            csShape="circle"
            [csIcon]="isMuted ? 'volume-off' : 'volume'"
            [disabled]="playerDisabled"
            [attr.aria-label]="isMuted ? '取消静音' : '静音'"
            [attr.title]="isMuted ? '取消静音' : '静音'"
            (click)="$event.stopPropagation(); toggleMuted()">
          </button>

          <audio
            #audioElement
            [src]="resourcePreviewUrl"
            preload="metadata"
            (loadedmetadata)="onAudioReady()"
            (durationchange)="syncAudioState()"
            (timeupdate)="syncAudioState()"
            (play)="syncAudioState()"
            (pause)="syncAudioState()"
            (ended)="syncAudioState()"
            (volumechange)="syncAudioState()"
            (error)="onAudioError()">
            您的浏览器不支持音频播放
          </audio>
        </div>

        @if (isUploading) {
          <div
            class="upload-overlay"
            role="progressbar"
            aria-label="音频上传进度"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="uploadProgress">
            <div class="upload-overlay__content">
              <span class="upload-overlay__spinner" aria-hidden="true"></span>
              <div class="upload-overlay__body">
                <div class="upload-overlay__row">
                  <span>正在上传音频</span>
                  <span>{{ uploadProgress }}%</span>
                </div>
                <div class="upload-overlay__track" aria-hidden="true">
                  <span [style.width.%]="uploadProgress"></span>
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styleUrls: ['./audio-block.scss'],
  imports: [CsButtonComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioBlockComponent extends BaseBlockComponent<AudioBlockModel> {
  @ViewChild('audioElement', {read: ElementRef})
  audioElement?: ElementRef<HTMLAudioElement>;

  protected uploadProgress = 100;
  private uploadInProgress = false;
  protected currentTime = 0;
  protected duration = 0;
  protected isPlaying = false;
  protected isMuted = false;
  protected hasAudioError = false;

  private _fileService?: DocFileService;

  private get fileService() {
    return this._fileService ??= this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN);
  }

  get isPeerUploading(): boolean {
    const url = this.props.url;
    return !!url && this.fileService.isLocalObjectURL(url) && !this.fileService.getFileByObjectURL(url);
  }

  protected get resourcePreviewUrl(): string {
    const url = this.props.url;
    return url && this.fileService.isLocalObjectURL(url)
      ? this.fileService.getFilePreviewURLByObjectURL(url)
      : url;
  }

  protected get isUploading(): boolean {
    return this.uploadInProgress;
  }

  protected get playerDisabled(): boolean {
    return this.isUploading || this.hasAudioError;
  }

  protected get playbackPercent(): number {
    if (!Number.isFinite(this.duration) || this.duration <= 0) return 0;
    return Math.min(100, Math.max(0, this.currentTime / this.duration * 100));
  }

  protected formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  }

  protected togglePlay(): void {
    if (this.playerDisabled) return;
    const audio = this.audioElement?.nativeElement;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      this.isPlaying = false;
      this.changeDetectorRef.markForCheck();
    });
  }

  protected toggleMuted(): void {
    if (this.playerDisabled) return;
    const audio = this.audioElement?.nativeElement;
    if (!audio) return;
    audio.muted = !audio.muted;
  }

  protected seekTo(event: Event): void {
    if (this.playerDisabled) return;
    const audio = this.audioElement?.nativeElement;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const input = event.currentTarget as HTMLInputElement;
    audio.currentTime = Math.min(audio.duration, Math.max(0, input.valueAsNumber));
    this.syncAudioState();
  }

  protected syncAudioState(): void {
    const audio = this.audioElement?.nativeElement;
    if (!audio) return;
    this.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    this.currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    this.isPlaying = !audio.paused && !audio.ended;
    this.isMuted = audio.muted;
  }

  protected onAudioReady(): void {
    this.hasAudioError = false;
    this.syncAudioState();
  }

  protected onAudioError(): void {
    this.isPlaying = false;
    this.hasAudioError = true;
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

    this.uploadInProgress = true;
    this.uploadProgress = 0;
    this.changeDetectorRef.markForCheck();

    this.fileService.uploadAttachment(file, (p) => {
      // 上传期间块可能被本地/远端删除：detectChanges on destroyed view 会抛错
      if (this._isGone() || this.isReadonly) return;
      const nextProgress = Math.min(100, Math.max(0, Math.round(p)));
      if (nextProgress === this.uploadProgress) return;
      this.uploadProgress = nextProgress;
      this.changeDetectorRef.detectChanges();
    }).then(info => {
      this.fileService.removeObjectURL(url);
      this.uploadInProgress = false;
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
      this.uploadInProgress = false;
      this.doc.messageService.warn('音频上传失败');
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({url: '', name: '', size: 0});
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    });
  }
}
