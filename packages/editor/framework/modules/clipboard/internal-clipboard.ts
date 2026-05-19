import {IBlockSnapshot} from "../../block-std";
import {IAdapter} from "../../services";
import {ClipboardDataType} from "./types";

export const BLOCKCRAFT_WEB_SNAPSHOT_MIME = `web ${ClipboardDataType.BLOCKCRAFT_SNAPSHOT}`;
export const BLOCKCRAFT_CLIPBOARD_MARKER_CLASS = 'bc-clipboard-marker';
export const BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR = 'data-bc-clipboard-format';
export const BLOCKCRAFT_CLIPBOARD_VERSION_ATTR = 'data-bc-clipboard-version';
export const BLOCKCRAFT_CLIPBOARD_PAYLOAD_ATTR = 'data-bc-clipboard-payload';
export const BLOCKCRAFT_CLIPBOARD_FORMAT = 'blockcraft/snapshot';
export const BLOCKCRAFT_CLIPBOARD_VERSION = '1';

const STANDARD_CLIPBOARD_WRITE_TYPES = new Set<string>([
  ClipboardDataType.TEXT,
  ClipboardDataType.HTML,
  ClipboardDataType.IMAGE,
]);

export function supportsClipboardWriteType(type: string) {
  if (STANDARD_CLIPBOARD_WRITE_TYPES.has(type)) {
    return true;
  }

  const clipboardItemCtor = globalThis.ClipboardItem as
    | (typeof ClipboardItem & {supports?: (type: string) => boolean})
    | undefined;

  if (typeof clipboardItemCtor?.supports === 'function') {
    return clipboardItemCtor.supports(type);
  }

  return false;
}

function cloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isSnapshot(value: unknown): value is IBlockSnapshot {
  return !!value && typeof value === 'object'
    && 'flavour' in value
    && 'id' in value
    && 'nodeType' in value
    && 'children' in value;
}

export function serializeClipboardSnapshot(snapshot: IBlockSnapshot) {
  return JSON.stringify(snapshot);
}

function encodeClipboardPayload(snapshot: IBlockSnapshot) {
  return encodeURIComponent(serializeClipboardSnapshot(snapshot));
}

function decodeClipboardPayload(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function buildClipboardMarker(snapshot: IBlockSnapshot) {
  const payload = encodeClipboardPayload(snapshot);
  return `<span class="${BLOCKCRAFT_CLIPBOARD_MARKER_CLASS}" ${BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR}="${BLOCKCRAFT_CLIPBOARD_FORMAT}" ${BLOCKCRAFT_CLIPBOARD_VERSION_ATTR}="${BLOCKCRAFT_CLIPBOARD_VERSION}" ${BLOCKCRAFT_CLIPBOARD_PAYLOAD_ATTR}="${payload}"></span>`;
}

export function decorateClipboardHtml(html: string, snapshot: IBlockSnapshot) {
  if (!html) return html;
  if (html.includes(`${BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR}="${BLOCKCRAFT_CLIPBOARD_FORMAT}"`)) {
    return html;
  }

  const marker = buildClipboardMarker(snapshot);
  if (html.includes('</body>')) {
    return html.replace('</body>', `${marker}</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${marker}</html>`);
  }
  return `${html}${marker}`;
}

export function parseClipboardSnapshot(raw: string | null | undefined): IBlockSnapshot | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {snapshot?: unknown};
    const snapshot = isSnapshot(parsed?.snapshot) ? parsed.snapshot : isSnapshot(parsed) ? parsed : null;
    return snapshot ? cloneSnapshot(snapshot) : null;
  } catch {
    return null;
  }
}

export function parseClipboardSnapshotFromHtml(html: string | null | undefined): IBlockSnapshot | null {
  if (!html) return null;

  const markerPattern = new RegExp(
    `${BLOCKCRAFT_CLIPBOARD_FORMAT_ATTR}\\s*=\\s*(['"])${BLOCKCRAFT_CLIPBOARD_FORMAT}\\1[^>]*${BLOCKCRAFT_CLIPBOARD_PAYLOAD_ATTR}\\s*=\\s*(['"])(.*?)\\2`,
    'i'
  );
  const markerMatch = html.match(markerPattern);
  if (markerMatch?.[3]) {
    return parseClipboardSnapshot(decodeClipboardPayload(markerMatch[3]));
  }

  const payloadPattern = new RegExp(`${BLOCKCRAFT_CLIPBOARD_PAYLOAD_ATTR}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const payloadMatch = html.match(payloadPattern);
  if (!payloadMatch?.[2]) {
    return null;
  }

  return parseClipboardSnapshot(decodeClipboardPayload(payloadMatch[2]));
}

export async function buildClipboardItems(
  adapters: IAdapter[],
  snapshot: IBlockSnapshot,
  plainText: string,
  allowedAdapterTypes?: ReadonlySet<string>
) {
  const items: Record<string, string> = {
    [ClipboardDataType.TEXT]: plainText,
    [ClipboardDataType.BLOCKCRAFT_SNAPSHOT]: serializeClipboardSnapshot(snapshot),
  };

  for (const adapter of adapters) {
    if (allowedAdapterTypes && !allowedAdapterTypes.has(adapter.type)) {
      continue;
    }

    try {
      const serialized = await adapter.fromSnapshot(snapshot);
      items[adapter.type] = adapter.type === ClipboardDataType.HTML
        ? decorateClipboardHtml(serialized, snapshot)
        : serialized;
    } catch (e) {
      console.error(e);
    }
  }

  return items;
}
