import {generateId} from '@ccc/blockcraft';
import {DocumentFilePort} from '../platform/desktop-file-port';
import {AssetStore} from '../file-format/asset-store';
import {DocumentAsset, OpenedDocument, PersistedDocument, RecoveryDraft, SaveResult} from '../file-format/document-file.types';

export class DocumentSession {
  private _documentId = generateId();
  private createdAt = new Date().toISOString();
  private _path: string | null = null;
  private _title = '未命名';
  private _dirty = false;

  constructor(
    private readonly files: DocumentFilePort,
    private readonly assets: AssetStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  get path(): string | null { return this._path; }
  get documentId(): string { return this._documentId; }
  get title(): string { return this._title; }
  get dirty(): boolean { return this._dirty; }

  startNew(title = '未命名'): void {
    this._documentId = generateId();
    this._path = null;
    this._title = title;
    this.createdAt = this.now();
    this.assets.load([]);
    this._dirty = false;
  }

  adoptOpened(opened: OpenedDocument): void {
    this._documentId = opened.document.manifest.documentId;
    this._path = opened.path;
    this._title = opened.document.manifest.title || fileTitle(opened.path);
    this.createdAt = opened.document.manifest.createdAt;
    this.assets.load(opened.document.assets);
    this._dirty = false;
  }

  adoptRecovery(document: PersistedDocument): void {
    this._documentId = document.manifest.documentId;
    this._path = null;
    this._title = document.manifest.title || '恢复的文档';
    this.createdAt = document.manifest.createdAt;
    this.assets.load(document.assets);
    this._dirty = true;
  }

  markDirty(): void { this._dirty = true; }

  async save(snapshot: PersistedDocument['snapshot'], fileService: Parameters<AssetStore['buildDocument']>[2], path?: string): Promise<SaveResult> {
    return this.saveInternal(snapshot, fileService, path, false);
  }

  async saveAs(snapshot: PersistedDocument['snapshot'], fileService: Parameters<AssetStore['buildDocument']>[2]): Promise<SaveResult> {
    return this.saveInternal(snapshot, fileService, undefined, true);
  }

  private async saveInternal(
    snapshot: PersistedDocument['snapshot'],
    fileService: Parameters<AssetStore['buildDocument']>[2],
    path: string | undefined,
    forceDialog: boolean,
  ): Promise<SaveResult> {
    const document = await this.assets.buildDocument(snapshot, {
      documentId: this._documentId,
      title: this._title,
      createdAt: this.createdAt,
      updatedAt: this.now(),
    }, fileService);
    const result = await this.files.save(document, path ?? (forceDialog ? undefined : this._path ?? undefined));
    this._path = result.path;
    this._title = fileTitle(result.path) || this._title;
    this._dirty = false;
    return result;
  }

  async saveRecovery(snapshot: PersistedDocument['snapshot'], fileService: Parameters<AssetStore['buildDocument']>[2]): Promise<void> {
    const document = await this.assets.buildDocument(snapshot, {
      documentId: this._documentId,
      title: this._title,
      createdAt: this.createdAt,
      updatedAt: this.now(),
    }, fileService);
    await this.files.saveRecovery(this.documentId, document);
  }

  loadRecoveryDrafts(): Promise<RecoveryDraft[]> { return this.files.loadRecoveryDrafts(); }
  removeRecoveryDraft(): Promise<void> { return this.files.removeRecoveryDraft(this._documentId); }
}

function fileTitle(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.bcdoc$/i, '') || '';
}
