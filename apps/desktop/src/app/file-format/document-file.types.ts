import {IBlockSnapshot} from '@ccc/blockcraft';

export const DOCUMENT_FORMAT_ID = 'blockcraft.document';
export const DOCUMENT_FORMAT_VERSION = 1;

export interface DocumentAsset {
  id: string;
  path: string;
  mime: string;
  name: string;
  size: number;
  sha256: string;
  bytes: number[];
}

export interface DocumentManifest {
  formatId: typeof DOCUMENT_FORMAT_ID;
  formatVersion: number;
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  assets: Array<Omit<DocumentAsset, 'bytes'>>;
}

export interface PersistedDocument {
  manifest: DocumentManifest;
  snapshot: IBlockSnapshot;
  assets: DocumentAsset[];
}

export interface OpenedDocument {
  path: string;
  document: PersistedDocument;
}

export interface SaveResult {
  path: string;
  bytes: number;
}

export interface RecoveryDraft {
  id: string;
  updatedAt: string;
  document: PersistedDocument;
}

export function assertPersistedDocument(value: unknown): asserts value is PersistedDocument {
  if (!isRecord(value)) throw new Error('文档格式无效：不是对象');
  const manifest = value['manifest'];
  const snapshot = value['snapshot'];
  const assets = value['assets'];
  if (!isRecord(manifest) || manifest['formatId'] !== DOCUMENT_FORMAT_ID) {
    throw new Error('文档格式无效：formatId 不匹配');
  }
  if (manifest['formatVersion'] !== DOCUMENT_FORMAT_VERSION) {
    throw new Error(`暂不支持的文档格式版本：${String(manifest['formatVersion'])}`);
  }
  if (!isRecord(snapshot) || snapshot['flavour'] !== 'root') {
    throw new Error('文档格式无效：根快照缺失');
  }
  if (!Array.isArray(assets) || !Array.isArray(manifest['assets'])) {
    throw new Error('文档格式无效：资源清单缺失');
  }
  const ids = new Set<string>();
  for (const asset of assets) {
    if (!isRecord(asset) || typeof asset['id'] !== 'string' || ids.has(asset['id'])) {
      throw new Error('文档格式无效：资源 ID 重复或缺失');
    }
    ids.add(asset['id']);
    if (!Array.isArray(asset['bytes'])) throw new Error('文档格式无效：资源数据缺失');
    if (!/^assets\/[a-z0-9-]+\.[a-z0-9]+$/i.test(String(asset['path']))) {
      throw new Error('文档格式无效：资源路径非法');
    }
  }
}

export function migratePersistedDocument(value: unknown): PersistedDocument {
  // v1 is the first persisted format. Keeping migration as a named boundary
  // makes future versions explicit instead of silently accepting new shapes.
  assertPersistedDocument(value);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
