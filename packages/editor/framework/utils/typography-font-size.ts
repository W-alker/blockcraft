import {
  normalizeDocumentFontSize,
  normalizeFontSizePixels,
  normalizeParagraphFontScale,
  readInlineFontSize,
  resolveEditableBlockFontSize,
} from '../block-std/typography/core';
import {normalizeObjectTextStyle} from '../block-std/block/object-format/object-format';

/** Model-only inherited theme size; no materialization or DOM layout reads. */
export function inheritedBlockFontSize(doc: BlockCraft.Doc, blockId: string, semanticDefault = false): number {
  const model = doc.model;
  let id: string | null = model?.getParentId?.(blockId) ?? null;
  const visited = new Set<string>();
  while (id && !visited.has(id)) {
    visited.add(id);
    const props = model.getProps(id) ?? {};
    const flavour = model.getFlavour(id);
    if ((flavour === 'text-box' && !semanticDefault) || (flavour === 'render-unit' && props['textFont'])) {
      return normalizeObjectTextStyle(props).fontSize;
    }
    if (flavour === 'root') {
      return normalizeDocumentFontSize(props['fs']) ?? doc.layoutMetrics?.baseFontSize ?? 16;
    }
    id = model.getParentId(id);
  }
  return doc.layoutMetrics?.baseFontSize ?? 16;
}

export function resolvedBlockFontSize(
  doc: BlockCraft.Doc, blockId: string, props: Record<string, unknown>, flavour?: string,
): number {
  const semanticDefault = normalizeParagraphFontScale(props['pfs']) === null &&
    (flavour === 'caption' || [1, 2, 3, 4].includes(props['heading'] as number));
  return resolveEditableBlockFontSize(props, flavour, inheritedBlockFontSize(doc, blockId, semanticDefault));
}

export function resolvedInlineFontSize(
  paragraphSize: number, props: Record<string, unknown>, attrs: Readonly<Record<string, unknown>>,
): number {
  const size = readInlineFontSize(attrs);
  // Legacy CSS px already override the computed parent size. Compact px are
  // base sizes and deliberately retain the independent paragraph multiplier.
  const paragraphScale = normalizeFontSizePixels(attrs['t:px']) !== null
    ? normalizeParagraphFontScale(props['pfs']) ?? 1 : 1;
  return Math.round((size.pixels === null ? paragraphSize : size.pixels * paragraphScale) * size.scale * 1000) / 1000;
}
