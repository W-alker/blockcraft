import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, DOC_FILE_SERVICE_TOKEN, DocFileService} from "../../framework";
import {MatIcon} from "@angular/material/icon";
import {AttachmentBlockModel} from "./index";
import {FileSizePipe} from "./file-size.pipe";
import {getAttachmentIcon} from "./icons";

@Component({
  selector: 'div.attachment-block',
  template: `
    @if (!props.url) {
      <div class="attachment-block__empty" contenteditable="false">
        <i class="bc_icon bc_wenjian-color"></i>
        <span>上传文件</span>
      </div>
    } @else if (isPeerUploading) {
      <div class="attachment-block__prefix">
        <i class="bc_icon bc_wenjian-color"></i>
      </div>
      <div class="attachment-block__info">
        <div class="attachment-block__name" spellcheck="false">{{ props.name }}</div>
        <div class="attachment-block__size">同步中...</div>
      </div>
      <div class="attachment-block__icon-wrapper">
        <div class="attachment-block__progress">
          <div class="attachment-block__spinner"></div>
        </div>
      </div>
    } @else {
      <div class="attachment-block__prefix">
        <i class="bc_icon bc_wenjian-color"></i>
      </div>
      <div class="attachment-block__info">
        <div class="attachment-block__name" spellcheck="false">{{ props.name }}</div>
        <div class="attachment-block__size">{{ props.size | fileSize }}</div>
      </div>
      <div class="attachment-block__icon-wrapper">
        @if (uploadProgress === 100) {
          <mat-icon [svgIcon]="props.icon"></mat-icon>
        } @else {
          <div class="attachment-block__progress">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bc-border-color, #E9E9E7)" stroke-width="3"/>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bc-active-color, #4857E2)" stroke-width="3"
                      stroke-dasharray="97.4" [attr.stroke-dashoffset]="97.4 - (97.4 * uploadProgress / 100)"
                      stroke-linecap="round" transform="rotate(-90 18 18)"/>
            </svg>
            <span>{{ uploadProgress }}%</span>
          </div>
        }
      </div>
    }
  `,
  standalone: true,
  imports: [MatIcon, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockComponent extends BaseBlockComponent<AttachmentBlockModel> {
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
    if (!this.props.url) return;

    if (!this.props.url.startsWith('http') && !this.props.url.startsWith('data:')) {
      this.uploadFile(this.props.url);
    }
  }

  inputLocalFile = async () => {
    try {
      const files = await this.fileService.inputFiles();
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
      this.uploadProgress = p;
      this.changeDetectorRef.detectChanges();
    }).then(info => {
      this.fileService.removeObjectURL(url);
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
      this.setInitProps({url: '', name: '', size: 0, type: '', icon: ''});
      this.uploadProgress = 100;
      this.changeDetectorRef.markForCheck();
    });
  }
}
