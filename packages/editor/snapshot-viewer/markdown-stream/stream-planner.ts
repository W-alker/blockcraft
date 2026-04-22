import {
  MarkdownPlannedBlockKind,
  MarkdownPlannedRange,
  MarkdownStreamPlannerInput,
  MarkdownStreamPlannerResult,
} from "./types";

export function planMarkdownStream(
  input: MarkdownStreamPlannerInput
): MarkdownStreamPlannerResult {
  const changedOffset = findFirstChangedOffset(input.previousText, input.nextText);
  const reparseStart = findSafeBoundaryStart(input.nextText, changedOffset);
  const {readyRanges, provisionalRanges, pendingRanges} = scanMarkdownRanges(
    input.nextText,
    reparseStart,
    input.finalized
  );

  return {
    changedOffset,
    reparseStart,
    readyRanges,
    provisionalRanges,
    pendingRanges,
  };
}

function scanMarkdownRanges(
  text: string,
  startOffset: number,
  finalized: boolean
): Pick<MarkdownStreamPlannerResult, "readyRanges" | "provisionalRanges" | "pendingRanges"> {
  const readyRanges: MarkdownPlannedRange[] = [];
  const provisionalRanges: MarkdownPlannedRange[] = [];
  const pendingRanges: MarkdownPlannedRange[] = [];
  const lines = splitLines(text);
  let index = findLineIndexForOffset(lines, startOffset);

  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;

    if (line.text.trim() === "") {
      index += 1;
      continue;
    }

    if (isFenceStart(line.text)) {
      const fenceResult = consumeFence(lines, index, finalized);
      pushRange(fenceResult.range, readyRanges, provisionalRanges, pendingRanges);
      index = fenceResult.nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableResult = consumeTable(lines, index, finalized);
      pushRange(tableResult.range, readyRanges, provisionalRanges, pendingRanges);
      index = tableResult.nextIndex;
      continue;
    }

    const blockResult = consumeImmediateBlock(lines, index, finalized);
    pushRange(blockResult.range, readyRanges, provisionalRanges, pendingRanges);
    index = blockResult.nextIndex;
  }

  return {readyRanges, provisionalRanges, pendingRanges};
}

function consumeFence(lines: LineEntry[], startIndex: number, finalized: boolean) {
  const opener = lines[startIndex]!;
  const lang = opener.text.trim().slice(3).trim().toLowerCase();
  let endIndex = startIndex + 1;

  while (endIndex < lines.length && !isFenceEnd(lines[endIndex]!.text)) {
    endIndex += 1;
  }

  const hasClosingFence = endIndex < lines.length;
  const closed = hasClosingFence || finalized;
  const isMermaid = lang === "mermaid";
  const rangeEnd = hasClosingFence ? lines[endIndex]!.end : lines[lines.length - 1]!.end;
  return {
    range: {
      kind: isMermaid ? "mermaid" : "code",
      state: closed ? "stable" : (isMermaid ? "pending" : "provisional"),
      start: opener.start,
      end: rangeEnd,
      text: linesToText(lines, startIndex, hasClosingFence ? endIndex + 1 : lines.length),
    } satisfies MarkdownPlannedRange,
    nextIndex: hasClosingFence ? endIndex + 1 : lines.length,
  };
}

function consumeTable(lines: LineEntry[], startIndex: number, finalized: boolean) {
  let endIndex = startIndex + 2;
  while (endIndex < lines.length && isTableRow(lines[endIndex]!.text)) {
    endIndex += 1;
  }

  const endedByBoundary = endIndex < lines.length ? lines[endIndex]!.text.trim() === "" || !isTableRow(lines[endIndex]!.text) : finalized;
  return {
    range: {
      kind: endedByBoundary ? "table" : "raw-text",
      state: endedByBoundary ? "stable" : "provisional",
      start: lines[startIndex]!.start,
      end: lines[endIndex - 1]!.end,
      text: linesToText(lines, startIndex, endIndex),
    } satisfies MarkdownPlannedRange,
    nextIndex: endIndex,
  };
}

function consumeImmediateBlock(lines: LineEntry[], startIndex: number, finalized: boolean) {
  const firstLine = lines[startIndex]!;
  const kind = classifyImmediateLine(firstLine.text);
  let endIndex = startIndex + 1;

  while (endIndex < lines.length) {
    const nextLine = lines[endIndex]!;
    if (nextLine.text.trim() === "" || isFenceStart(nextLine.text) || isTableStart(lines, endIndex)) {
      break;
    }
    if (kind !== classifyImmediateLine(nextLine.text)) {
      break;
    }
    endIndex += 1;
  }

  const hasBoundary = endIndex < lines.length ? lines[endIndex]!.text.trim() === "" : finalized || firstLine.text.endsWith("\n");
  return {
    range: {
      kind,
      state: hasBoundary ? "stable" : "provisional",
      start: firstLine.start,
      end: lines[endIndex - 1]!.end,
      text: linesToText(lines, startIndex, endIndex),
    } satisfies MarkdownPlannedRange,
    nextIndex: endIndex,
  };
}

function classifyImmediateLine(line: string): MarkdownPlannedBlockKind {
  const trimmed = line.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return "heading";
  if (/^\s*>\s?/.test(line)) return "blockquote";
  if (/^\s*([-*+]|\d+\.)\s+/.test(line)) return "list";
  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) return "divider";
  return "paragraph";
}

function isFenceStart(line: string) {
  return /^\s*```/.test(line);
}

function isFenceEnd(line: string) {
  return /^\s*```/.test(line);
}

function isTableStart(lines: LineEntry[], index: number) {
  if (index + 1 >= lines.length) {
    return false;
  }
  return isTableRow(lines[index]!.text) && isTableSeparator(lines[index + 1]!.text);
}

function isTableRow(line: string) {
  return line.includes("|");
}

function isTableSeparator(line: string) {
  const trimmed = line.trim();
  return /^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed);
}

function isTableRelatedLine(line: string) {
  return isTableRow(line) || isTableSeparator(line);
}

function findFirstChangedOffset(previousText: string, nextText: string) {
  const max = Math.min(previousText.length, nextText.length);
  for (let index = 0; index < max; index += 1) {
    if (previousText[index] !== nextText[index]) {
      return index;
    }
  }
  return max;
}

function findSafeBoundaryStart(text: string, offset: number) {
  if (offset <= 0 || !text) {
    return 0;
  }

  const lines = splitLines(text);
  const lineIndex = findLineIndexForOffset(lines, offset);
  const tableLineIndex = resolveTableContextLineIndex(lines, lineIndex);
  if (tableLineIndex !== -1) {
    let startIndex = tableLineIndex;
    while (startIndex > 0 && isTableRelatedLine(lines[startIndex - 1]!.text)) {
      startIndex -= 1;
    }
    return lines[startIndex]!.start;
  }

  const beforeOffset = text.slice(0, offset);
  const blankLineBoundary = beforeOffset.lastIndexOf("\n\n");

  if (blankLineBoundary < 0) {
    return 0;
  }

  return blankLineBoundary + 2;
}

function resolveTableContextLineIndex(lines: LineEntry[], lineIndex: number) {
  if (!lines.length) {
    return -1;
  }

  const safeIndex = Math.min(lineIndex, lines.length - 1);
  const current = lines[safeIndex]!;
  if (isTableRelatedLine(current.text)) {
    return safeIndex;
  }

  if (current.text.trim() === "" && safeIndex > 0 && isTableRelatedLine(lines[safeIndex - 1]!.text)) {
    return safeIndex - 1;
  }

  return -1;
}

function splitLines(text: string): LineEntry[] {
  const result: LineEntry[] = [];
  let index = 0;

  text.split(/(?<=\n)/).forEach((line) => {
    const start = index;
    index += line.length;
    result.push({text: line, start, end: index});
  });

  if (text && !text.endsWith("\n")) {
    const last = result[result.length - 1];
    if (!last) {
      result.push({text, start: 0, end: text.length});
    }
  }

  return result;
}

function findLineIndexForOffset(lines: LineEntry[], offset: number) {
  const foundIndex = lines.findIndex((line) => offset <= line.end);
  return foundIndex === -1 ? 0 : foundIndex;
}

function linesToText(lines: LineEntry[], startIndex: number, endIndex: number) {
  return lines.slice(startIndex, endIndex).map((line) => line.text).join("");
}

function pushRange(
  range: MarkdownPlannedRange,
  readyRanges: MarkdownPlannedRange[],
  provisionalRanges: MarkdownPlannedRange[],
  pendingRanges: MarkdownPlannedRange[]
) {
  if (range.state === "stable") {
    readyRanges.push(range);
    return;
  }
  if (range.state === "provisional") {
    provisionalRanges.push(range);
    return;
  }
  pendingRanges.push(range);
}

interface LineEntry {
  text: string
  start: number
  end: number
}
