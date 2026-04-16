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
  const {readyRanges, pendingRanges} = scanMarkdownRanges(
    input.nextText,
    reparseStart,
    input.finalized
  );

  return {
    changedOffset,
    reparseStart,
    readyRanges,
    pendingRanges,
  };
}

function scanMarkdownRanges(
  text: string,
  startOffset: number,
  finalized: boolean
): Pick<MarkdownStreamPlannerResult, "readyRanges" | "pendingRanges"> {
  const readyRanges: MarkdownPlannedRange[] = [];
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
      pushRange(fenceResult.range, fenceResult.ready, readyRanges, pendingRanges);
      index = fenceResult.nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableResult = consumeTable(lines, index, finalized);
      pushRange(tableResult.range, tableResult.ready, readyRanges, pendingRanges);
      index = tableResult.nextIndex;
      continue;
    }

    const blockResult = consumeImmediateBlock(lines, index, finalized);
    pushRange(blockResult.range, blockResult.ready, readyRanges, pendingRanges);
    index = blockResult.nextIndex;
  }

  return {readyRanges, pendingRanges};
}

function consumeFence(lines: LineEntry[], startIndex: number, finalized: boolean) {
  const opener = lines[startIndex]!;
  const lang = opener.text.trim().slice(3).trim().toLowerCase();
  let endIndex = startIndex + 1;

  while (endIndex < lines.length && !isFenceEnd(lines[endIndex]!.text)) {
    endIndex += 1;
  }

  const hasClosingFence = endIndex < lines.length;
  const rangeEnd = hasClosingFence ? lines[endIndex]!.end : lines[lines.length - 1]!.end;
  return {
    range: {
      kind: lang === "mermaid" ? "mermaid" : "code",
      start: opener.start,
      end: rangeEnd,
      text: linesToText(lines, startIndex, hasClosingFence ? endIndex + 1 : lines.length),
    } satisfies MarkdownPlannedRange,
    ready: hasClosingFence || finalized,
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
      kind: "table",
      start: lines[startIndex]!.start,
      end: lines[endIndex - 1]!.end,
      text: linesToText(lines, startIndex, endIndex),
    } satisfies MarkdownPlannedRange,
    ready: endedByBoundary,
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
      start: firstLine.start,
      end: lines[endIndex - 1]!.end,
      text: linesToText(lines, startIndex, endIndex),
    } satisfies MarkdownPlannedRange,
    ready: hasBoundary,
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
  const boundaryCandidates = [
    beforeOffset.lastIndexOf("\n\n"),
    beforeOffset.lastIndexOf("\n```"),
  ].filter((candidate) => candidate >= 0);

  if (boundaryCandidates.length === 0) {
    return 0;
  }

  const boundary = Math.max(...boundaryCandidates);
  return boundary === beforeOffset.lastIndexOf("\n\n") ? boundary + 2 : boundary + 1;
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
  ready: boolean,
  readyRanges: MarkdownPlannedRange[],
  pendingRanges: MarkdownPlannedRange[]
) {
  if (ready) {
    readyRanges.push(range);
    return;
  }
  pendingRanges.push(range);
}

interface LineEntry {
  text: string
  start: number
  end: number
}
