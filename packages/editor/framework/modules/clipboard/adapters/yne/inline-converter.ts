// Clipboard-owned Youdao Note inline converter.
import { DeltaInsert } from "../../../..";
import { YneCharStyle, YneRichText } from "./types";

export interface InlineConvertOptions {
  /** When true (heading blocks), the per-char font-size is discarded. */
  dropFontSize?: boolean;
}

export function styleToAttributes(
  styles: YneCharStyle | undefined,
  opts: InlineConvertOptions = {}
): Record<string, unknown> | null {
  if (!styles) return null;
  const attrs: Record<string, unknown> = {};
  if (styles.bold) attrs['a:bold'] = true;
  if (styles.italic) attrs['a:italic'] = true;
  if (styles.strike) attrs['a:strike'] = true;
  if (styles.color) attrs['s:color'] = styles.color;
  if (styles['back-color']) attrs['s:background'] = styles['back-color'];
  if (!opts.dropFontSize && typeof styles['font-size'] === 'number') {
    attrs['s:fontSize'] = `${styles['font-size']}px`;
  }
  return Object.keys(attrs).length ? attrs : null;
}

export function richTextToDelta(
  richText: YneRichText | undefined,
  opts: InlineConvertOptions = {}
): DeltaInsert[] {
  const chars = richText?.data ?? [];
  const runs: DeltaInsert[] = [];
  let current: DeltaInsert | null = null;
  let currentKey = '';

  for (const c of chars) {
    const attrs = styleToAttributes(c.styles, opts);
    // attrs is built in a fixed key order, so JSON.stringify is a stable run key.
    const key = attrs ? JSON.stringify(attrs) : '';
    if (current && key === currentKey) {
      current.insert = (current.insert as string) + c.char;
    } else {
      // Cast: our attribute keys follow the a:/s: naming convention and are
      // compatible with IInlineNodeAttrs at runtime.
      current = attrs
        ? { insert: c.char, attributes: attrs as DeltaInsert['attributes'] }
        : { insert: c.char };
      currentKey = key;
      runs.push(current);
    }
  }
  return runs;
}
