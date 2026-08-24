import {IBlockSnapshot, DocFileService} from '@ccc/blockcraft';
import {DocumentAsset, DOCUMENT_FORMAT_ID, DOCUMENT_FORMAT_VERSION, PersistedDocument} from './document-file.types';

const RESOURCE_FLAVOURS = new Set(['image', 'video', 'audio', 'attachment']);

export class AssetStore {
  private readonly assets = new Map<string, DocumentAsset>();

  load(assets: readonly DocumentAsset[]): void {
    this.assets.clear();
    for (const asset of assets) this.assets.set(asset.id, asset);
  }

  async buildDocument(
    snapshot: IBlockSnapshot,
    metadata: {documentId: string; title: string; createdAt: string; updatedAt: string},
    fileService: DocFileService,
  ): Promise<PersistedDocument> {
    const normalized = await this.normalizeSnapshot(snapshot, fileService, true);
    const assets = [...this.assets.values()];
    return {
      manifest: {
        formatId: DOCUMENT_FORMAT_ID,
        formatVersion: DOCUMENT_FORMAT_VERSION,
        ...metadata,
        assets: assets.map(({bytes: _bytes, ...asset}) => asset),
      },
      snapshot: normalized,
      assets,
    };
  }

  async hydrateSnapshot(snapshot: IBlockSnapshot, fileService: DocFileService): Promise<IBlockSnapshot> {
    return this.normalizeSnapshot(snapshot, fileService, false);
  }

  private async normalizeSnapshot(
    snapshot: IBlockSnapshot,
    fileService: DocFileService,
    persist: boolean,
  ): Promise<IBlockSnapshot> {
    const copy = JSON.parse(JSON.stringify(snapshot)) as IBlockSnapshot;
    const visit = async (node: IBlockSnapshot): Promise<void> => {
      if (RESOURCE_FLAVOURS.has(node.flavour)) {
        const props = node.props as Record<string, unknown>;
        for (const [key, value] of Object.entries(props)) {
          if (typeof value !== 'string') continue;
          if (persist && fileService.isLocalObjectURL(value)) {
            const file = fileService.getFileByObjectURL(value);
            if (!file) throw new Error(`资源已失效，无法保存：${node.flavour}.${key}`);
            props[key] = await this.register(file);
          } else if (!persist && value.startsWith('asset://')) {
            const asset = this.assets.get(value.slice('asset://'.length));
            if (!asset) throw new Error(`文档资源缺失：${value}`);
            const file = new File([new Uint8Array(asset.bytes)], asset.name, {type: asset.mime});
            const localUrl = fileService.createObjectURL(file);
            props[key] = node.flavour === 'attachment'
              ? localUrl
              : fileService.getFilePreviewURLByObjectURL(localUrl);
          } else if (persist && /^https?:\/\//i.test(value)) {
            throw new Error(`资源未打包，请先导入本地文件：${value}`);
          }
        }
      }
      if (node.nodeType === 'root' || node.nodeType === 'block') {
        for (const child of node.children) await visit(child);
      }
    };
    await visit(copy);
    return copy;
  }

  private async register(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const id = hash;
    if (!this.assets.has(id)) {
      const extension = extensionFor(file.name, file.type);
      this.assets.set(id, {
        id,
        path: `assets/${id}.${extension}`,
        mime: file.type || 'application/octet-stream',
        name: file.name || `${id}.${extension}`,
        size: bytes.byteLength,
        sha256: hash,
        bytes: Array.from(bytes),
      });
    }
    return `asset://${id}`;
  }
}

function extensionFor(name: string, mime: string): string {
  const fromName = name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (fromName) return fromName.slice(0, 12);
  return mime.split('/').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'bin';
}
