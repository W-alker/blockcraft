// Clipboard-owned Youdao Note table converter.
import { BlockNodeType, generateId, IBlockSnapshot } from "../../../..";
import {
  ParagraphBlockSchema,
  TableBlockSchema,
  TableCellBlockSchema,
} from "../../../../../blocks";
import { richTextToDelta } from "./inline-converter";
import { YneBlock, YneTableCell } from "./types";

function cellToSnapshot(cell: YneTableCell): IBlockSnapshot {
  // TableCellBlockSchema.createSnapshot() returns a cell with one default empty paragraph child.
  // We replace children when the cell has real content lines.
  const snap = TableCellBlockSchema.createSnapshot();

  // Covered cells: set display:'none' (same convention as html table-matcher)
  if (cell.mergePointDX != null || cell.mergePointDY != null) {
    snap.props['display'] = 'none';
    // Covered cells keep the default empty paragraph child — they're hidden anyway.
    return snap;
  }

  // Anchor cells: set colspan/rowspan
  if (cell.mergeWidth != null && cell.mergeWidth > 1) snap.props['colspan'] = cell.mergeWidth;
  if (cell.mergeHeight != null && cell.mergeHeight > 1) snap.props['rowspan'] = cell.mergeHeight;

  // Build paragraph children from content lines (each YneRichText → one paragraph)
  const lines = cell.content?.data ?? [];
  if (lines.length) {
    // Cast is required because IBlockSnapshot.children is typed as `IBlockSnapshot[]`
    // for block nodes, but the type union makes it `IBlockSnapshot[] | [] | InlineModel`.
    // ParagraphBlockSchema.createSnapshot() returns a valid IBlockSnapshot at runtime.
    (snap.children as IBlockSnapshot[]) = lines.map(line =>
      ParagraphBlockSchema.createSnapshot(richTextToDelta(line)) as unknown as IBlockSnapshot
    );
  }

  return snap;
}

export function yneTableToSnapshot(block: YneBlock): IBlockSnapshot {
  const data = block.data;
  const widths = data?.widths ?? [];
  const heights = data?.heights ?? [];
  const cells = data?.cells ?? [];
  const colCount = widths.length;
  const rowCount = heights.length;

  if (!colCount || !rowCount || cells.length !== rowCount * colCount) {
    throw new Error('yne: malformed table dimensions');
  }

  const rows: IBlockSnapshot[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowCells: IBlockSnapshot[] = [];
    for (let c = 0; c < colCount; c++) {
      rowCells.push(cellToSnapshot(cells[r * colCount + c]));
    }
    rows.push({
      id: generateId(),
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      props: { height: heights[r] || 60 },
      meta: {},
      children: rowCells,
    } as unknown as IBlockSnapshot);
  }

  // TableBlockSchema.createSnapshot(rows, cols) generates its own row/cell children.
  // We override children immediately after to use our converted rows.
  const table = TableBlockSchema.createSnapshot(rowCount, colCount);
  table.props['colWidths'] = widths.slice();
  // Assign our rows, replacing the schema-generated default rows.
  (table.children as IBlockSnapshot[]) = rows;
  return table;
}
