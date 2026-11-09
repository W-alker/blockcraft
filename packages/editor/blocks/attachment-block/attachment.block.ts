import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, DOC_FILE_SERVICE_TOKEN, DocFileService} from "../../framework";
import {CsIconComponent} from "@cses/ui";
import {AttachmentBlockModel} from "./index";
import {FileSizePipe} from "./file-size.pipe";
import {getAttachmentFileIcon, getAttachmentIcon} from "./icons";
import {splitAttachmentName} from './attachment-name';

@Component({
  selector: 'div.attachment-block',
  template: `
    @if (!props.url) {
      <div class="attachment-block__empty" contenteditable="false">
        <cs-icon csType="file-unknown" useSvg />
        <span>上传文件</span>
      </div>
    } @else {
      @let peerUploading = isPeerUploading;
      <div class="attachment-block__icon-wrapper">
        @if (peerUploading) {
          <div class="attachment-block__spinner"></div>
        } @else if (uploadProgress !== 100) {
          <div class="attachment-block__progress">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bc-border-color)" stroke-width="3"/>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bc-active-color)" stroke-width="3"
                      stroke-dasharray="97.4" [attr.stroke-dashoffset]="97.4 - (97.4 * uploadProgress / 100)"
                      stroke-linecap="round" transform="rotate(-90 18 18)"/>
            </svg>
            <span>{{ uploadProgress }}%</span>
          </div>
        } @else {
          <cs-icon [csType]="fileIcon" useSvg />
        }
      </div>
      <div class="attachment-block__info">
        @let fileName = splitAttachmentName(props.name);
        <div class="attachment-block__name" spellcheck="false" [title]="props.name"><span class="attachment-block__name-stem">{{ fileName.stem }}</span><span class="attachment-block__name-extension">{{ fileName.extension }}</span></div>
      </div>
      <div class="attachment-block__size">{{ peerUploading ? '同步中...' : uploadProgress !== 100 ? '上传中...' : (props.size | fileSize) }}</div>
    }
  `,
  standalone: true,
  imports: [CsIconComponent, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockComponent extends BaseBlockComponent<AttachmentBlockModel> {
  protected uploadProgress = 100;
  protected readonly splitAttachmentName = splitAttachmentName;

  protected get fileIcon(): string {
    return getAttachmentFileIcon(this.props.type, this.props.name);
  }

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
    if (!this.props.url) return;

    if (!this.props.url.startsWith('http') && !this.props.url.startsWith('data:')) {
      this.uploadFile(this.props.url);
    }
  }

  inputLocalFile = async () => {
    if (this.isReadonly) return;
    try {
      const files = await this.fileService.inputFiles();
      if (this._isGone() || this.isReadonly) return;
      if (!files || files.length === 0) return;
      const file = files[0];

      if (this.fileService.isOverMaxSize(file.size)) {
        this.doc.messageService.warn('文件过大');
        return;
      }

      const url = this.fileService.createObjectURL(file);
      this.setInitProps({
        name: file.name,
        size: file.size,
        type: file.type,
        icon: getAttachmentIcon(file.type),
        url
      });
      this.uploadFile(url);
    } catch (e) {
      console.error('选择文件失败', e);
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
        type: info.type,
        icon: getAttachmentIcon(info.type),
      });
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    }).catch(() => {
      this.fileService.removeObjectURL(url);
      this.doc.messageService.warn('上传失败');
      if (this._isGone() || this.isReadonly) return;
      this.setInitProps({url: '', name: '', size: 0, type: '', icon: ''});
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    });
  }
}
