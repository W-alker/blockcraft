import {ClipboardDataType} from "./types";

const MARKDOWN_PATTERNS = [
  /(^|\n)\s{0,3}#{1,6}\s+\S+/,
  /(^|\n)\s*([-*+])\s+\S+/,
  /(^|\n)\s*\d+\.\s+\S+/,
  /(^|\n)\s*>\s+\S+/,
  /```[\s\S]*```/,
  /~~~/,
  /\[[^\]]+\]\([^)]+\)/,
  /(^|\n)\s*[-*+]\s+\[[ xX]\]\s+/,
  /(^|\n)\|.+\|\s*(\n|$)/,
  /\$\$[\s\S]*\$\$/,
  /(^|[^\w])(\*\*|__)[^*_]+(\*\*|__)([^\w]|$)/,
];

export function cloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function looksLikeMarkdown(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return MARKDOWN_PATTERNS.some(pattern => pattern.test(normalized));
}

export function isLegacyMarkdownPayload(text: string) {
  return !text.trimStart().startsWith('{\\rtf');
}

export function parseTabularText(text: string) {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n+$/g, '');
  if (!normalized.includes('\t')) return null;

  const rows = normalized
    .split('\n')
    .map(row => row.split('\t').map(cell => cell.trim()))
    .filter(row => row.some(cell => cell.length > 0));

  if (!rows.length) return null;

  const colCount = Math.max(...rows.map(row => row.length));
  if (!colCount) return null;

  return rows.map(row => {
    if (row.length === colCount) return row;
    return [...row, ...Array.from({length: colCount - row.length}, () => '')];
  });
}

export function createTableSnapshotFromMatrix(
  doc: BlockCraft.Doc,
  matrix: string[][],
  depth = 0
) {
  const rowCount = Math.max(matrix.length, 1);
  const colCount = Math.max(...matrix.map(row => row.length), 1);
  const normalizedMatrix = matrix.map(row => {
    if (row.length === colCount) return row;
    return [...row, ...Array.from({length: colCount - row.length}, () => '')];
  });

  const tableSnapshot = doc.schemas.createSnapshot('table', [rowCount, colCount]);
  tableSnapshot.props.depth = depth;
  tableSnapshot.props['colWidths'] = Array.from({length: colCount}, () => 100);
  tableSnapshot.children = normalizedMatrix.map(row => {
    const rowSnapshot = doc.schemas.createSnapshot('table-row', [0]);
    rowSnapshot.children = row.map(value => {
      const cellSnapshot = doc.schemas.createSnapshot('table-cell', []);
      cellSnapshot.children = [doc.schemas.createSnapshot('paragraph', [value, {depth: 0}])];
      return cellSnapshot;
    });
    return rowSnapshot;
  });

  return tableSnapshot;
}

export function getMarkdownClipboardText(state: {
  dataTypes: readonly string[]
  getData: (type: ClipboardDataType) => string | null
}) {
  if (state.dataTypes.includes(ClipboardDataType.MARKDOWN)) {
    return state.getData(ClipboardDataType.MARKDOWN);
  }

  if (!state.dataTypes.includes(ClipboardDataType.RTF)) {
    return null;
  }

  const legacyMarkdown = state.getData(ClipboardDataType.RTF);
  if (!legacyMarkdown || !isLegacyMarkdownPayload(legacyMarkdown)) {
    return null;
  }

  return legacyMarkdown;
}
