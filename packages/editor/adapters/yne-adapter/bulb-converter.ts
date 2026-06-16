// packages/editor/adapters/yne-adapter/bulb-converter.ts
//
// Converter for 有道云笔记's "bulb" document format — the JSON embedded in the
// pasted HTML as `<article data-content="…">`. Unlike `text/yne-json` (a separate
// clipboard MIME that WKWebView/Tauri strips), this travels inside text/html and
// is therefore available in every environment. See youdao-html.ts for the entry.
//
// Shape (per block): { type:'block', name, data, nodes, state }
//   - inline text: nodes:[{ type:'text', leaves:[{ text, marks:[{type,value?}] }] }]
//   - table: nested table > table-row > table-cell(data.colSpan/rowSpan)

import { BlockNodeType, DeltaInsert, IBlockProps, IBlockSnapshot, generateId } from "../../framework";
import {
  BulletBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  OrderedBlockSchema,
  ParagraphBlockSchema,
  TableBlockSchema,
  TableCellBlockSchema,
  TodoBlockSchema,
} from "../../blocks";
import { DocFileService } from "../../framework";
import { buildAttachmentSnapshot, buildImageSnapshot } from "./resource";
import { mapLang } from "./block-converters";

export interface BulbMark {
  type: string;
  value?: string | number;
}

export interface BulbLeaf {
  text?: string;
  marks?: BulbMark[];
}

export interface BulbNode {
  type?: string;
  id?: string;
  name?: string;
  data?: {
    level?: string;
    listType?: string;
    listLevel?: number;
    checked?: boolean;
    url?: string;
    width?: number;
    height?: number;
    fileName?: string;
    fileLength?: number;
    resource?: string;
    source?: string;
    colSpan?: number;
    rowSpan?: number;
    colsWidth?: number[];
    rowsHeight?: number[];
    style?: { textAlign?: string };
    lang?: string;
    language?: string;
  };
  nodes?: BulbNode[];
  leaves?: BulbLeaf[];
  state?: { index?: number };
}

export interface BulbConvertContext {
  /** ordered base64 data: URIs pulled from the visible <img data-media-type="image"> tags */
  imageDataUris: string[];
  imageCursor: { i: number };
  fileService: DocFileService;
}

interface MarkOptions {
  dropFontSize?: boolean;
}

export function marksToAttributes(
  marks: BulbMark[] | undefined,
  opts: MarkOptions = {}
): Record<string, unknown> | null {
  if (!marks?.length) return null;
  const attrs: Record<string, unknown> = {};
  for (const m of marks) {
    switch (m.type) {
      case 'bold': attrs['a:bold'] = true; break;
      case 'italic': attrs['a:italic'] = true; break;
      case 'delete':
      case 'strikethrough': attrs['a:strike'] = true; break;
      case 'underline': attrs['a:underline'] = true; break;
      case 'color': if (m.value) attrs['s:color'] = m.value; break;
      case 'backgroundColor': if (m.value) attrs['s:background'] = m.value; break;
      case 'fontSize':
        if (m.value != null && !opts.dropFontSize) {
          attrs['s:fontSize'] = typeof m.value === 'number' ? `${m.value}px` : m.value;
        }
        break;
      default: break;
    }
  }
  return Object.keys(attrs).length ? attrs : null;
}

/** Flatten a block's text nodes' leaves into delta runs. */
export function bulbNodesToDelta(nodes: BulbNode[] | undefined, opts: MarkOptions = {}): DeltaInsert[] {
  const out: DeltaInsert[] = [];
  for (const n of nodes ?? []) {
    if (n.type !== 'text' || !n.leaves) continue;
    for (const leaf of n.leaves) {
      const text = leaf.text ?? '';
      if (!text) continue;
      const attrs = marksToAttributes(leaf.marks, opts);
      out.push(attrs ? { insert: text, attributes: attrs as DeltaInsert['attributes'] } : { insert: text });
    }
  }
  return out;
}

function alignProps(block: BulbNode): IBlockProps {
  const align = block.data?.style?.textAlign;
  return align && align !== 'left' ? ({ textAlign: align } as IBlockProps) : ({} as IBlockProps);
}

function headingLevel(level: string | undefined): number {
  const n = Number(String(level ?? '').replace(/[^0-9]/g, '')) || 1;
  return Math.min(3, Math.max(1, n));
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function hiddenCell(): IBlockSnapshot {
  const snap = TableCellBlockSchema.createSnapshot();
  snap.props['display'] = 'none';
  return snap as unknown as IBlockSnapshot;
}

function anchorCell(cell: BulbNode | undefined, colSpan: number, rowSpan: number, ctx: BulbConvertContext): IBlockSnapshot {
  const snap = TableCellBlockSchema.createSnapshot();
  if (colSpan > 1) snap.props['colspan'] = colSpan;
  if (rowSpan > 1) snap.props['rowspan'] = rowSpan;
  const children = (cell?.nodes ?? []).flatMap(child => convertBulbBlock(child, ctx));
  if (children.length) {
    (snap.children as IBlockSnapshot[]) = children;
  }
  return snap as unknown as IBlockSnapshot;
}

function bulbTableToSnapshot(block: BulbNode, ctx: BulbConvertContext): IBlockSnapshot {
  const colsWidth = block.data?.colsWidth ?? [];
  const rowsHeight = block.data?.rowsHeight ?? [];
  const bulbRows = (block.nodes ?? []).filter(n => n.name === 'table-row');
  const colCount = colsWidth.length || Math.max(0, ...bulbRows.map(r => (r.nodes ?? []).filter(c => c.name === 'table-cell').length));
  const rowCount = rowsHeight.length || bulbRows.length;
  if (!colCount || !rowCount) throw new Error('bulb: malformed table dimensions');

  const occupied = Array.from({ length: rowCount }, () => Array<boolean>(colCount).fill(false));
  const rows: IBlockSnapshot[] = [];

  for (let r = 0; r < rowCount; r++) {
    const present = (bulbRows[r]?.nodes ?? []).filter(c => c.name === 'table-cell');
    let pi = 0;
    const cells: IBlockSnapshot[] = [];
    for (let c = 0; c < colCount; c++) {
      if (occupied[r][c]) { cells.push(hiddenCell()); continue; }
      const cell = present[pi++];
      const colSpan = Math.max(1, cell?.data?.colSpan || 1);
      const rowSpan = Math.max(1, cell?.data?.rowSpan || 1);
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          if ((dr || dc) && occupied[r + dr]) occupied[r + dr][c + dc] = true;
        }
      }
      cells.push(anchorCell(cell, colSpan, rowSpan, ctx));
    }
    rows.push({
      id: generateId(),
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      props: { height: rowsHeight[r] || 60 },
      meta: {},
      children: cells,
    } as unknown as IBlockSnapshot);
  }

  const table = TableBlockSchema.createSnapshot(rowCount, colCount);
  table.props.colWidths = colsWidth.slice();
  (table.children as IBlockSnapshot[]) = rows;
  return table;
}

/**
 * 有道云 code & diagram blocks nest each line as a `code-line` *block* child
 * (type:'block'), whose children are the text nodes — so bulbNodesToDelta(block.nodes)
 * alone yields nothing. Descend into the code-lines and join them with "\n".
 * Falls back to direct text extraction if a payload inlines text nodes.
 */
function bulbCodeText(block: BulbNode): string {
  const lines = (block.nodes ?? []).filter(n => n.name === 'code-line');
  if (lines.length) {
    return lines
      .map(line => bulbNodesToDelta(line.nodes).map(d => d.insert as string).join(''))
      .join('\n');
  }
  return bulbNodesToDelta(block.nodes).map(d => d.insert as string).join('');
}

/** Recursively collect plain text from any bulb subtree — used to salvage the
 *  content of an unknown block instead of aborting the whole paste. */
function bulbCollectText(block: BulbNode): string {
  let out = '';
  for (const n of block.nodes ?? []) {
    if (n.type === 'text' && n.leaves) {
      for (const leaf of n.leaves) out += leaf.text ?? '';
    } else {
      out += bulbCollectText(n);
    }
  }
  return out;
}

export function convertBulbBlock(block: BulbNode, ctx: BulbConvertContext): IBlockSnapshot[] {
  switch (block.name) {
    case 'heading': {
      const delta = bulbNodesToDelta(block.nodes, { dropFontSize: true });
      return [ParagraphBlockSchema.createSnapshot(delta, { heading: headingLevel(block.data?.level), ...alignProps(block) } as IBlockProps)];
    }
    case 'paragraph': {
      return [ParagraphBlockSchema.createSnapshot(bulbNodesToDelta(block.nodes), alignProps(block))];
    }
    case 'list-item': {
      const depth = Math.max(0, (block.data?.listLevel ?? 1) - 1);
      const delta = bulbNodesToDelta(block.nodes);
      const props = alignProps(block);
      if (block.data?.listType === 'ordered') {
        const order = Math.max(0, (block.state?.index ?? 1) - 1);
        const snap = OrderedBlockSchema.createSnapshot(delta, { depth, ...props } as IBlockProps) as unknown as IBlockSnapshot;
        // `order` is not forwarded by editableBlockCreateSnapShotFn — set it manually
        snap.props['order'] = order;
        return [snap];
      }
      return [BulletBlockSchema.createSnapshot(delta, { depth, ...props } as IBlockProps) as unknown as IBlockSnapshot];
    }
    case 'todo': {
      const checked = block.data?.checked ? Date.now() : 0;
      const snap = TodoBlockSchema.createSnapshot(bulbNodesToDelta(block.nodes), alignProps(block)) as unknown as IBlockSnapshot;
      // `checked` is not forwarded by editableBlockCreateSnapShotFn — set it manually
      snap.props['checked'] = checked;
      return [snap];
    }
    case 'code':
    case 'diagram': {
      // 有道云 diagram (PlantUML/Mermaid) has no native counterpart — preserve its
      // source as a code block. PlantUML/Mermaid aren't in SHIKI_LANGUAGE_MAP, so
      // mapLang resolves them to PlainText automatically.
      const text = bulbCodeText(block);
      const snap = CodeBlockSchema.createSnapshot(text) as unknown as IBlockSnapshot;
      // `lang` isn't forwarded by editableBlockCreateSnapShotFn — set it manually.
      snap.props['lang'] = mapLang(block.data?.language ?? block.data?.lang);
      return [snap];
    }
    case 'hr':
    case 'horizontal-line':
      return [DividerBlockSchema.createSnapshot() as unknown as IBlockSnapshot];
    case 'image':
      return [buildImageSnapshot({
        fallbackUrl: block.data?.url || '',
        dataUri: ctx.imageDataUris[ctx.imageCursor.i++],
        width: num(block.data?.width),
        height: num(block.data?.height),
        fileService: ctx.fileService,
      })];
    case 'attachment':
      return [buildAttachmentSnapshot({
        url: block.data?.source || block.data?.resource || '',
        fileName: block.data?.fileName || 'attachment',
        fileLength: block.data?.fileLength || 0,
      })];
    case 'table':
      return [bulbTableToSnapshot(block, ctx)];
    default: {
      // Unknown block: degrade to a text paragraph (or drop if empty) rather than
      // throwing — one unsupported block must not abort the whole high-fidelity paste.
      const text = bulbCollectText(block).trim();
      return text
        ? [ParagraphBlockSchema.createSnapshot([{ insert: text }] as DeltaInsert[])]
        : [];
    }
  }
}
