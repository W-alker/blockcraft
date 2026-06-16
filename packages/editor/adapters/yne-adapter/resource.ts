// packages/editor/adapters/yne-adapter/resource.ts
import { DOC_FILE_SERVICE_TOKEN, IBlockSnapshot } from "../../framework";
import { ImageBlockSchema, AttachmentBlockSchema } from "../../blocks";
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

export function yneImageToSnapshot(block: YneBlock, ctx: YneConvertContext): IBlockSnapshot {
  const source = block.source || '';
  const width = typeof block.styles?.width === 'number' ? block.styles.width : undefined;
  const height = typeof block.styles?.height === 'number' ? block.styles.height : undefined;
  const title = block.title || undefined;

  let src = source;
  const base64 = source ? ctx.imageMap.get(source) : undefined;
  if (base64) {
    const file = dataUriToFile(base64, title || 'image.png');
    if (file) src = ctx.fileService.createObjectURL(file);
  }
  // ImageBlockSchema.createSnapshot(src, width?, height?, title?)
  return ImageBlockSchema.createSnapshot(src, width, height, title) as unknown as IBlockSnapshot;
}

export function yneAttachmentToSnapshot(block: YneBlock, ctx: YneConvertContext): IBlockSnapshot {
  const url = block.source || block.resource || '';
  const fileName = block.fileName || 'attachment';
  const fileLength = block.fileLength || 0;
  const snap = AttachmentBlockSchema.createSnapshot({
    name: fileName,
    url,
    type: inferMimeType(fileName),
    size: fileLength,
  }) as unknown as IBlockSnapshot;
  if (url) {
    ctx.deferredAttachments.push({ snapshot: snap, url, fileName, fileLength });
  }
  return snap;
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
