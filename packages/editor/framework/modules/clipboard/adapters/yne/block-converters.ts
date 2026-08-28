// Clipboard-owned Youdao Note block converters.
import { IBlockProps, IBlockSnapshot } from "../../../..";
import { splitDeltaByLineBreak } from "../../../../../global";
import {
  BulletBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  OrderedBlockSchema,
  ParagraphBlockSchema,
  TodoBlockSchema,
  SHIKI_LANGUAGE_MAP,
} from "../../../../../blocks";
import { richTextToDelta } from "./inline-converter";
import { yneTableToSnapshot } from "./table-converter";
import { yneImageToSnapshot, yneAttachmentToSnapshot } from "./resource";
import { YneBlock, YneConvertContext } from "./types";

/** Returns textAlign prop only when align is non-left (avoids polluting the snapshot). */
function alignProps(block: YneBlock): Record<string, unknown> {
  const align = block.styles?.align;
  return align && align !== 'left' ? { textAlign: align } : {};
}

/** Build delta, split on hard line breaks, and emit one block per segment. */
function editableSegments(
  block: YneBlock,
  extraProps: Record<string, unknown>,
  make: (delta: ReturnType<typeof richTextToDelta>, props: Record<string, unknown>) => IBlockSnapshot
): IBlockSnapshot[] {
  const delta = richTextToDelta(block.richText);
  const segments = splitDeltaByLineBreak(delta);
  const list = segments.length ? segments : [[]];
  const props = { ...alignProps(block), ...extraProps };
  return list.map(seg => make(seg, props));
}

/** Resolve a 有道云 language string to a valid CodeBlock lang key (case-insensitive),
 *  defaulting to PlainText. Shared with the bulb (HTML) converter. */
export function mapLang(language: string | undefined): string {
  if (!language) return 'PlainText';
  const lower = String(language).toLowerCase();
  const key = Object.keys(SHIKI_LANGUAGE_MAP).find(k => k.toLowerCase() === lower);
  return key || 'PlainText';
}

export function convertBlock(block: YneBlock, ctx: YneConvertContext): IBlockSnapshot[] {
  switch (block.blockType) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(block.level) || 1));
      const delta = richTextToDelta(block.richText, { dropFontSize: true });
      const props = { ...alignProps(block), heading: level };
      // Cast required: createSnapshot returns a concrete model type, not IBlockSnapshot
      return [ParagraphBlockSchema.createSnapshot(delta, props as IBlockProps) as unknown as IBlockSnapshot];
    }
    case 'paragraph': {
      return editableSegments(block, {}, (seg, props) =>
        ParagraphBlockSchema.createSnapshot(seg, props as IBlockProps) as unknown as IBlockSnapshot
      );
    }
    case 'list-item': {
      const depth = Number(block.level) || 0;
      if (block.listType === 'ordered') {
        const order = typeof block.index === 'number' ? block.index : 0;
        return editableSegments(block, { depth }, (seg, props) => {
          const snap = OrderedBlockSchema.createSnapshot(seg, props as IBlockProps) as unknown as IBlockSnapshot;
          // `order` is not handled by editableBlockCreateSnapShotFn — set it manually
          snap.props['order'] = order;
          return snap;
        });
      }
      return editableSegments(block, { depth }, (seg, props) =>
        BulletBlockSchema.createSnapshot(seg, props as IBlockProps) as unknown as IBlockSnapshot
      );
    }
    case 'todo': {
      const checked = block.checked ? Date.now() : 0;
      return editableSegments(block, {}, (seg, props) => {
        const snap = TodoBlockSchema.createSnapshot(seg, props as IBlockProps) as unknown as IBlockSnapshot;
        // `checked` is not handled by editableBlockCreateSnapShotFn — set it manually
        snap.props['checked'] = checked;
        return snap;
      });
    }
    case 'horizontal-line': {
      const snap = DividerBlockSchema.createSnapshot() as unknown as IBlockSnapshot;
      const color = block.styles?.color;
      if (color) snap.props['color'] = color;
      return [snap];
    }
    case 'code':
    case 'diagram': {
      // diagram (PlantUML/Mermaid) has no native counterpart — preserve its source as
      // a code block. Its language isn't in SHIKI_LANGUAGE_MAP so mapLang → PlainText.
      const text = (block.richText?.data ?? []).map(c => c.char).join('');
      const lang = mapLang(block.language);
      // Code block: raw text, no line-break splitting — newlines are part of the code.
      const snap = CodeBlockSchema.createSnapshot(text) as unknown as IBlockSnapshot;
      // `lang` lives in defaultProps but the passed props arg doesn't override it via
      // editableBlockCreateSnapShotFn — set it directly after creation.
      snap.props['lang'] = lang;
      return [snap];
    }
    case 'table':
      return [yneTableToSnapshot(block)];
    case 'image':
      return [yneImageToSnapshot(block, ctx)];
    case 'attachment':
      return [yneAttachmentToSnapshot(block, ctx)];
    default: {
      // Unknown blockType: degrade to a text paragraph (or drop if empty) rather than
      // throwing — one unsupported block must not abort the whole high-fidelity paste.
      const text = richTextToDelta(block.richText).map(d => d.insert as string).join('').trim();
      return text
        ? [ParagraphBlockSchema.createSnapshot(text) as unknown as IBlockSnapshot]
        : [];
    }
  }
}
