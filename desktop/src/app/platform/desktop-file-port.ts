import {migratePersistedDocument, OpenedDocument, PersistedDocument, RecoveryDraft, SaveResult} from '../file-format/document-file.types';

interface TauriGlobals {
  core?: {invoke(command: string, args?: Record<string, unknown>): Promise<unknown>};
  event?: {listen(name: string, callback: (event: {payload: unknown}) => void): Promise<() => void>};
  dialog?: {
    open(options?: Record<string, unknown>): Promise<string | string[] | null>;
    save(options?: Record<string, unknown>): Promise<string | null>;
  };
}

declare global {
  interface Window { __TAURI__?: TauriGlobals; }
}

export interface DocumentFileCodec {
  encode(document: PersistedDocument): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<PersistedDocument>;
}

export interface DocumentFilePort {
  open(): Promise<OpenedDocument | null>;
  openPath(path: string): Promise<OpenedDocument>;
  save(document: PersistedDocument, path?: string): Promise<SaveResult>;
  saveRecovery(id: string, document: PersistedDocument): Promise<void>;
  loadRecoveryDrafts(): Promise<RecoveryDraft[]>;
  removeRecoveryDraft(id: string): Promise<void>;
}

export class TauriDocumentFileCodec implements DocumentFileCodec {
  async encode(document: PersistedDocument): Promise<Uint8Array> {
    return toBytes(await invokeDesktop('encode_bcdoc', {document}));
  }

  async decode(bytes: Uint8Array): Promise<PersistedDocument> {
    return migratePersistedDocument(await invokeDesktop('decode_bcdoc', {bytes: Array.from(bytes)}));
  }
}

export class TauriDocumentFilePort implements DocumentFilePort {
  constructor(private readonly codec: DocumentFileCodec = new TauriDocumentFileCodec()) {}

  async open(): Promise<OpenedDocument | null> {
    const selected = await window.__TAURI__?.dialog?.open({
      multiple: false,
      directory: false,
      filters: [{name: 'BlockCraft Document', extensions: ['bcdoc']}],
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return null;
    return this.openPath(path);
  }

  async openPath(path: string): Promise<OpenedDocument> {
    const bytes = toBytes(await invokeDesktop('read_document', {path}));
    return {path, document: await this.codec.decode(bytes)};
  }

  async save(document: PersistedDocument, path?: string): Promise<SaveResult> {
    const target = path ?? await window.__TAURI__?.dialog?.save({
      defaultPath: `${document.manifest.title || '未命名'}.bcdoc`,
      filters: [{name: 'BlockCraft Document', extensions: ['bcdoc']}],
    });
    if (!target) throw new Error('已取消保存');
    const bytes = await this.codec.encode(document);
    await invokeDesktop('write_document', {path: target, bytes: Array.from(bytes)});
    return {path: target, bytes: bytes.byteLength};
  }

  async saveRecovery(id: string, document: PersistedDocument): Promise<void> {
    const bytes = await this.codec.encode(document);
    await invokeDesktop('write_recovery', {id, bytes: Array.from(bytes)});
  }

  async loadRecoveryDrafts(): Promise<RecoveryDraft[]> {
    const ids = await invokeDesktop('list_recovery', {}) as Array<{id: string}>;
    const drafts: RecoveryDraft[] = [];
    for (const item of ids) {
      const bytes = toBytes(await invokeDesktop('read_recovery', {id: item.id}));
      const document = await this.codec.decode(bytes);
      drafts.push({id: item.id, updatedAt: document.manifest.updatedAt, document});
    }
    return drafts;
  }

  removeRecoveryDraft(id: string): Promise<void> {
    return invokeDesktop('remove_recovery', {id}).then(() => undefined);
  }
}

async function invokeDesktop(command: string, args: Record<string, unknown>): Promise<unknown> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error('当前不是 Tauri 桌面运行环境');
  return invoke(command, args);
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new Error('原生文件接口返回了无效的字节数据');
}
