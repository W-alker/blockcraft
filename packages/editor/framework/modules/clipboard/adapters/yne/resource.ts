// Clipboard-owned Youdao Note resource handling.
import { DOC_FILE_SERVICE_TOKEN, DocFileService, IBlockSnapshot } from "../../../..";
import { ImageBlockSchema, AttachmentBlockSchema } from "../../../../../blocks";
import { YneBlock, YneConvertContext, YneDeferredAttachment } from "./types";

const EXT_MIME: Record<string, string> = {
  csv: 'text/csv',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function inferMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] || 'application/octet-stream';
}

export function dataUriToFile(dataUri: string, fileName: string): File | null {
  const match = /^data:([^;,]{0,200})?(;base64)?,([\s\S]*)$/.exec(dataUri);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const payload = match[3];
  try {
    let bytes: Uint8Array;
    if (isBase64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return new File([bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer], fileName, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Build an image snapshot. If `dataUri` (inline base64) is provided it is decoded
 * to a File and registered via the file service so the image block auto-uploads;
 * otherwise the `fallbackUrl` (e.g. 有道云 URL) is used as-is.
 * Shared by the text/yne-json path and the 有道云 HTML data-content path.
 */
export function buildImageSnapshot(opts: {
  fallbackUrl?: string;
  dataUri?: string;
  width?: number;
  height?: number;
  title?: string;
  fileService: DocFileService;
}): IBlockSnapshot {
  let src = opts.fallbackUrl || '';
  if (opts.dataUri) {
    const file = dataUriToFile(opts.dataUri, opts.title || 'image.png');
    if (file) src = opts.fileService.createObjectURL(file);
  }
  // ImageBlockSchema.createSnapshot(src, width?, height?, title?)
  return ImageBlockSchema.createSnapshot(src, opts.width, opts.height, opts.title) as unknown as IBlockSnapshot;
}

/**
 * Transient meta key marking an attachment snapshot that should be re-hosted
 * after insertion. Set by the converters (which can't reach `doc`/post-insertion
 * timing), collected + stripped by the clipboard before the snapshot is written
 * to Yjs — so it never syncs to peers and only the local paster re-hosts.
 */
export const YNE_REHOST_META = '__yneRehost';

/**
 * Build an attachment snapshot pointing at the 有道云 URL and tag it for async
 * re-host. Shared by the text/yne-json path and the HTML data-content path.
 */
export function buildAttachmentSnapshot(opts: {
  url: string;
  fileName: string;
  fileLength: number;
}): IBlockSnapshot {
  const snap = AttachmentBlockSchema.createSnapshot({
    name: opts.fileName,
    url: opts.url,
    type: inferMimeType(opts.fileName),
    size: opts.fileLength,
  }) as unknown as IBlockSnapshot;
  if (opts.url) {
    (snap.meta as Record<string, unknown>)[YNE_REHOST_META] = {
      url: opts.url,
      fileName: opts.fileName,
      fileLength: opts.fileLength,
    };
  }
  return snap;
}

/**
 * Walk a root snapshot, collect attachment re-host markers (holding live snapshot
 * references so their final `.id` can be read after `replaceSnapshotsIdDeeply`),
 * and STRIP the markers so they never reach Yjs. Returns the list to re-host.
 */
export function collectAndStripRehostMarkers(root: IBlockSnapshot): YneDeferredAttachment[] {
  const out: YneDeferredAttachment[] = [];
  const visit = (node: IBlockSnapshot): void => {
    const meta = node.meta as Record<string, unknown> | undefined;
    const marker = meta?.[YNE_REHOST_META] as YneRehostMarker | undefined;
    if (marker) {
      out.push({ snapshot: node, url: marker.url, fileName: marker.fileName, fileLength: marker.fileLength });
      delete meta![YNE_REHOST_META];
    }
    const children = node.children as unknown[];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object' && 'flavour' in child) {
          visit(child as IBlockSnapshot);
        }
      }
    }
  };
  visit(root);
  return out;
}

interface YneRehostMarker {
  url: string;
  fileName: string;
  fileLength: number;
}

export function yneImageToSnapshot(block: YneBlock, ctx: YneConvertContext): IBlockSnapshot {
  const source = block.source || '';
  return buildImageSnapshot({
    fallbackUrl: source,
    dataUri: source ? ctx.imageMap.get(source) : undefined,
    width: typeof block.styles?.width === 'number' ? block.styles.width : undefined,
    height: typeof block.styles?.height === 'number' ? block.styles.height : undefined,
    title: block.title || undefined,
    fileService: ctx.fileService,
  });
}

export function yneAttachmentToSnapshot(block: YneBlock, _ctx: YneConvertContext): IBlockSnapshot {
  return buildAttachmentSnapshot({
    url: block.source || block.resource || '',
    fileName: block.fileName || 'attachment',
    fileLength: block.fileLength || 0,
  });
}

/**
 * Post-insertion async re-host: fetch the 有道云 URL, re-upload via the file
 * service, and swap the block's url. Best-effort — keeps the 有道云 URL on any
 * failure (CORS/auth). Guards against the block being removed during the await.
 */
export async function rehostYneAttachments(
  doc: BlockCraft.Doc,
  deferred: YneDeferredAttachment[]
): Promise<void> {
  if (!deferred.length) return;
  const fileService = doc.injector.get(DOC_FILE_SERVICE_TOKEN);

  await Promise.all(
    deferred.map(async d => {
      if (!doc.vm.get(d.snapshot.id)) return; // block removed before re-host
      try {
        const resp = await fetch(d.url);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const type = inferMimeType(d.fileName);
        const file = new File([blob], d.fileName, { type });
        const info = await fileService.uploadAttachment(file);
        // Only adopt the re-uploaded URL if it's a final http(s) URL. Backend-less
        // file services return blob:/object URLs from uploadAttachment, and the
        // attachment block treats any non-http url as "still uploading"
        // (its ready-check is `url.startsWith('http')`). Adopting such a url would
        // leave the block stuck — keep the original 有道云 http url instead.
        if (!info?.url || !/^https?:/i.test(info.url)) return;
        const ref = doc.vm.get(d.snapshot.id);
        if (!ref) return; // removed during upload
        // setInitProps is protected on BaseBlockComponent; cast to call it from outside.
        // This is the designated no-undo init path (matches image/attachment auto-upload swap).
        (ref.instance as unknown as { setInitProps(p: Record<string, unknown>): void })
          .setInitProps({ url: info.url, size: info.size, name: info.name });
      } catch (e) {
        doc.logger?.warn?.('yne attachment re-host failed', e);
      }
    })
  );
}
