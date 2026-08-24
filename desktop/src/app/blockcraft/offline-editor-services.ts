import {Injectable, Injector} from '@angular/core';
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  ClipboardDataType,
  DOC_FILE_SERVICE_TOKEN,
  DocAdapterService,
  DocFileService,
  DocLinkPreviewerService,
  LinkPreviewData,
  DocMessageService,
  HtmlAdapter,
  IAdapter,
  MarkdownAdapter,
  BlockCreatorService,
  DocAttachmentInfo,
  IBlockSchemaOptions,
} from '@ccc/blockcraft';

const LOCAL_PREFIX = '__blockcraft_desktop_local__:';

@Injectable()
export class OfflineFileService extends DocFileService {
  private readonly objects = new Map<string, {file: File; nativeUrl: string}>();
  private readonly maxSize = 60 * 1024 * 1024;

  uploadImg(file: File): Promise<string> {
    return Promise.resolve(this.createObjectURL(file));
  }

  uploadVideo(file: File): Promise<DocAttachmentInfo> {
    return Promise.resolve(this.attachment(file));
  }

  uploadAttachment(file: File): Promise<DocAttachmentInfo> {
    return Promise.resolve(this.attachment(file));
  }

  previewAttachment(): void {}
  previewImg(): void {}

  createObjectURL(file: File): string {
    const nativeUrl = URL.createObjectURL(file);
    const key = LOCAL_PREFIX + nativeUrl;
    this.objects.set(key, {file, nativeUrl});
    this.objects.set(nativeUrl, {file, nativeUrl});
    return key;
  }

  getFileByObjectURL(url: string): File | undefined {
    return this.objects.get(url)?.file;
  }

  getFilePreviewURLByObjectURL(url: string): string {
    return this.objects.get(url)?.nativeUrl ?? url.replace(LOCAL_PREFIX, '');
  }

  removeObjectURL(url: string): void {
    const entry = this.objects.get(url);
    if (!entry) return;
    URL.revokeObjectURL(entry.nativeUrl);
    this.objects.delete(entry.nativeUrl);
    this.objects.delete(url);
  }

  isLocalObjectURL(url: string): boolean {
    return this.objects.has(url);
  }

  isOverMaxSize(size: number): boolean {
    return size > this.maxSize;
  }

  private attachment(file: File): DocAttachmentInfo {
    const localUrl = this.createObjectURL(file);
    return {
      name: file.name,
      type: file.type || 'application/octet-stream',
      url: this.getFilePreviewURLByObjectURL(localUrl),
      size: file.size,
    };
  }
}

@Injectable()
export class OfflineMessageService extends DocMessageService {
  success(message: string): void { console.info(message); }
  error(message: string): void { console.error(message); }
  info(message: string): void { console.info(message); }
  warn(message: string): void { console.warn(message); }
}

@Injectable()
export class OfflineLinkPreviewerService extends DocLinkPreviewerService {
  override query = async (_url: string, _signal?: AbortSignal): Promise<Partial<LinkPreviewData>> => {
    return Promise.resolve({});
  }
}

@Injectable()
export class OfflineAdapterService extends DocAdapterService {
  readonly supportedAdapters: IAdapter[];

  constructor(private readonly injector: Injector) {
    super();
    const fileService = injector.get(DOC_FILE_SERVICE_TOKEN);
    const html = new HtmlAdapter(fileService);
    const markdown = new MarkdownAdapter(fileService);
    this.supportedAdapters = [
      {type: ClipboardDataType.HTML, toSnapshot: value => html.toBlockSnapshot(value), fromSnapshot: snapshot => html.toHtml(snapshot)},
      {type: ClipboardDataType.MARKDOWN, toSnapshot: value => markdown.toBlockSnapshot(value), fromSnapshot: snapshot => markdown.toMarkdown(snapshot)},
    ];
  }
}

@Injectable()
export class OfflineBlockCreatorService extends BlockCreatorService {
  constructor(private readonly injector: Injector) {
    super();
  }

  async getParamsByScheme<T extends IBlockSchemaOptions>(schema: T): Promise<BlockCraft.BlockCreateParameters<T['flavour']> | null> {
    const fileService = this.injector.get(DOC_FILE_SERVICE_TOKEN);
    if (!['image', 'video', 'audio', 'attachment'].includes(schema.flavour)) return null;
    const fileList = await fileService.inputFiles();
    const file = fileList[0];
    if (!file) return null;
    if (fileService.isOverMaxSize(file.size)) throw new Error('文件过大');
    const url = fileService.createObjectURL(file);
    if (schema.flavour === 'image') return [{src: url}] as unknown as BlockCraft.BlockCreateParameters<T['flavour']>;
    if (schema.flavour === 'attachment') {
      return [{name: file.name, size: file.size, type: file.type, url}] as BlockCraft.BlockCreateParameters<T['flavour']>;
    }
    return [{sourceType: 'local', name: file.name, size: file.size, type: file.type, url}] as BlockCraft.BlockCreateParameters<T['flavour']>;
  }
}
