import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core';
import {DomSanitizer, SafeHtml, SafeResourceUrl} from '@angular/platform-browser';
import {
  BaseBlockComponent,
  deriveObjectSizeFromPixels,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
} from '../../framework';
import {VideoBlockModel} from './index';
import {
  BcResourcePlaceholderDirective,
  BlockResizeCommit,
  ResourceIntrinsicSize,
  ResizeContainerComponent,
} from '../../components';
import {takeUntil} from 'rxjs';

@Component({
  selector: 'div.video-block',
  template: `
    @if (!props.url) {
      <div class="upload-hint" contenteditable="false" (click)="!isReadonly && inputLocalFile()">
        <i class="bc_icon bc_shipin"></i>
        <span>点击插入视频</span>
      </div>
    } @else if (isPeerUploading) {
      <div class="peer-uploading" contenteditable="false">
        <div class="peer-uploading__spinner"></div>
        <span>同步中...</span>
      </div>
    } @else {
      <div class="video-block__wrapper resizable-container" contenteditable="false"
           bcResourcePlaceholder
           [resourceKey]="props.url"
           (resourceIntrinsicSize)="onResourceIntrinsicSize($event)"
           [style.width.px]="renderedWidth"
           [style.aspect-ratio]="renderedAspectRatio"
           [attr.data-bc-object-sizing]="usesRatioSizing ? '' : null"
           #resizeContainer>
        <div class="video-block__container">
          @if (isEmbedPlatformUrl) {
            <div class="embed-container" style="background: #1a1a1a;">
              <iframe
                [src]="embedUrl"
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowfullscreen="true"
                referrerpolicy="no-referrer">
              </iframe>
            </div>
          } @else if (isDirectVideoUrl) {
            <div class="video-wrapper">
              <video [src]="props.url"
                     controls
                     [poster]="posterUrl"
                     preload="metadata">
                您的浏览器不支持视频播放
              </video>
            </div>
          } @else {
            <div class="video-link-preview">
              <div class="link-info">
                <div class="link-title">视频链接</div>
                <a class="link-url" [href]="props.url" target="_blank"
                   rel="noopener noreferrer">
                  {{ props.url }}
                </a>
                <div class="link-hint">点击链接在新窗口打开视频</div>
              </div>
            </div>
          }
          @if (uploadProgress < 100 && uploadProgress >= 0) {
            <div class="upload-progress">
              <div class="upload-progress-bar">
                <div class="upload-progress-fill" [style.width.%]="uploadProgress"></div>
              </div>
              <span>上传中 {{ uploadProgress }}%</span>
            </div>
          }
        </div>

        @if (!isReadonly) {
          <block-resizer [container]="resizeContainer"
                         [maxWidthContainer]="sizingContainer"
                         [maxWidth]="rootContentWidth || undefined"
                         [referenceWidth]="rootContentWidth || undefined"
                         (resizeCommit)="onResized($event)"
                         (resizeStart)="resizeContainer.classList.add('is-resizing')"
                         (resizeEnd)="resizeContainer.classList.remove('is-resizing')"/>
        }
      </div>
    }
  `,
  standalone: true,
  styleUrls: ['./video-block.scss'],
  imports: [ResizeContainerComponent, BcResourcePlaceholderDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoBlockComponent extends BaseBlockComponent<VideoBlockModel> {
  protected uploadProgress = 100;
  protected sanitizedEmbedCode: SafeHtml = '';
  protected embedUrl: SafeResourceUrl = '';
  protected isEmbedPlatformUrl = false;
  protected isDirectVideoUrl = false;
  protected posterUrl = '';

  private _fileService?: DocFileService;

  constructor(private sanitizer: DomSanitizer) {
    super();
  }

  private get fileService() {
    return this._fileService ??= this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN);
  }

  get isPeerUploading(): boolean {
    const url = this.props.url;
    return !!url && this.fileService.isLocalObjectURL(url) && !this.fileService.getFileByObjectURL(url);
  }

  get objectDimensions() {
    return this.doc.objectSizing.resolve(this.flavour, this.props)
  }

  get renderedWidth(): number | null {
    return this.objectDimensions?.width ?? null
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

  get sizingContainer(): HTMLElement {
    return this.doc.objectSizing.rootContentElement ?? this.hostElement
  }

  override ngOnInit() {
    super.ngOnInit();
    this.processEmbedContent();

    if (this.props.url && this.props.sourceType === 'local') {
      if (!this.props.url.startsWith('http')) {
        this.uploadFile(this.props.url);
      }
    }

    this.changeDetectorRef.markForCheck();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.doc.objectSizing.widthChange$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(() => this.changeDetectorRef.markForCheck())
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
    this.updateProps({
      wr: derived.wr,
      ar: currentAr,
      width: null,
      height: null,
    });
    this.changeDetectorRef.markForCheck();
  }

  onResourceIntrinsicSize(size: ResourceIntrinsicSize) {
    if (this.props.ar != null || this.isReadonly || this._isGone()) return
    this.setInitProps({ar: size.ar})
  }

  processEmbedContent() {
    if (this.props.url) {
      this.checkAndConvertToEmbed(this.props.url);

      if (!this.isEmbedPlatformUrl) {
        this.isDirectVideoUrl = this.checkIsDirectVideoUrl(this.props.url);
      }
    }
  }

  checkIsDirectVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
    const lowerUrl = url.toLowerCase();

    if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
      return true;
    }

    if (this.props.sourceType === 'local') {
      return true;
    }

    if (this.props.type && this.props.type.startsWith('video/')) {
      return true;
    }

    return false;
  }

  checkAndConvertToEmbed(url: string) {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${youtubeMatch[1]}?rel=0`
      );
      return;
    }

    // Bilibili BV
    const bilibiliMatch = url.match(/(?:bilibili\.com\/video\/|b23\.tv\/)(BV[a-zA-Z0-9]+)/);
    if (bilibiliMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://player.bilibili.com/player.html?bvid=${bilibiliMatch[1]}&page=1&high_quality=1&danmaku=0&autoplay=0`
      );
      return;
    }

    // Bilibili AV
    const bilibiliAidMatch = url.match(/bilibili\.com\/video\/av(\d+)/);
    if (bilibiliAidMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://player.bilibili.com/player.html?aid=${bilibiliAidMatch[1]}&page=1&high_quality=1&danmaku=0&autoplay=0`
      );
      return;
    }

    // Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://player.vimeo.com/video/${vimeoMatch[1]}`
      );
      return;
    }

    // 优酷
    const youkuMatch = url.match(/youku\.com\/v_show\/id_([a-zA-Z0-9=]+)/);
    if (youkuMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://player.youku.com/embed/${youkuMatch[1].replace('.html', '')}`
      );
      return;
    }

    // 腾讯视频
    const qqVideoMatch = url.match(/v\.qq\.com\/x\/(?:cover\/[a-zA-Z0-9]+\/|page\/)([a-zA-Z0-9]+)/);
    if (qqVideoMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://v.qq.com/txp/iframe/player.html?vid=${qqVideoMatch[1]}`
      );
      return;
    }

    // 爱奇艺
    const iqiyiMatch = url.match(/iqiyi\.com\/v_([a-zA-Z0-9]+)/);
    if (iqiyiMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://open.iqiyi.com/developer/player_js/co498/?vid=${iqiyiMatch[1]}&autoplay=false`
      );
      return;
    }

    // 西瓜视频
    const xiguaMatch = url.match(/ixigua\.com\/(\d+)/);
    if (xiguaMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.ixigua.com/iframe/${xiguaMatch[1]}?autoplay=0`
      );
      return;
    }

    // Dailymotion
    const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dailymotionMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`
      );
      return;
    }

    // TikTok
    const tiktokMatch = url.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
    if (tiktokMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`
      );
      return;
    }

    // 微博视频
    const weiboMatch = url.match(/weibo\.com\/tv\/show\/(\d+:\d+)/);
    if (weiboMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://weibo.com/tv/embed?mid=${weiboMatch[1].replace(':', '_')}`
      );
      return;
    }

    // 搜狐视频
    const sohuMatch = url.match(/tv\.sohu\.com\/v\/([a-zA-Z0-9=]+)/);
    if (sohuMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://tv.sohu.com/upload/static/share/share_play.html#${sohuMatch[1]}`
      );
      return;
    }

    // 抖音
    const douyinMatch = url.match(/douyin\.com\/video\/(\d+)/);
    if (douyinMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.douyin.com/embed/video/${douyinMatch[1]}`
      );
      return;
    }

    // AcFun
    const acfunMatch = url.match(/acfun\.cn\/v\/ac(\d+)/);
    if (acfunMatch) {
      this.isEmbedPlatformUrl = true;
      this.embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.acfun.cn/player/ac${acfunMatch[1]}`
      );
      return;
    }

    this.isEmbedPlatformUrl = false;
  }

  inputLocalFile = async () => {
    if (this.isReadonly) return;
    try {
      const files = await this.fileService.inputFiles('video/*');
      if (this._isGone() || this.isReadonly) return;
      if (!files || files.length === 0) return;
      const file = files[0];

      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        this.doc.messageService.warn('视频文件过大，最大支持 100MB');
        return;
      }

      const url = this.fileService.createObjectURL(file);
      this.setInitProps({
        name: file.name,
        size: file.size,
        type: file.type,
        sourceType: 'local',
        url
      });
      this.uploadFile(url);
    } catch (e) {
      console.error('选择视频文件失败', e);
    }
  };

  uploadFile(url: string) {
    if (!this.fileService.isLocalObjectURL(url)) return;

    const file = this.fileService.getFileByObjectURL(url);
    if (!file) return; // 协同端上传，不处理

    this.uploadProgress = 0;
    this.changeDetectorRef.markForCheck();

    this.fileService.uploadVideo(file, (p) => {
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
        type: info.type,
      });
      this.uploadProgress = 100;
      this.processEmbedContent();
      this.changeDetectorRef.markForCheck();
    }).catch(() => {
      this.fileService.removeObjectURL(url);
      this.doc.messageService.warn('视频上传失败');
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({url: '', name: '', size: 0, type: ''});
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    });
  }
}
