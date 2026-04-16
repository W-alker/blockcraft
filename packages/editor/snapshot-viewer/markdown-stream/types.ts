import {SnapshotViewerOptions} from "../types";
import {IBlockSnapshot} from "../../framework/block-std/types/block.type";

export interface MarkdownStreamViewerOptions {
  container?: HTMLElement
  viewerOptions?: SnapshotViewerOptions
}

export interface MarkdownStreamViewer {
  append(chunk: string): void
  replace(markdown: string): void
  finish(): void
  destroy(): void
}

export type MarkdownPlannedBlockKind =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "list"
  | "divider"
  | "code"
  | "mermaid"
  | "table"
  | "unknown";

export interface MarkdownPlannedRange {
  kind: MarkdownPlannedBlockKind
  start: number
  end: number
  text: string
}

export interface MarkdownStreamPlannerInput {
  previousText: string
  nextText: string
  finalized: boolean
}

export interface MarkdownStreamPlannerResult {
  changedOffset: number
  reparseStart: number
  readyRanges: MarkdownPlannedRange[]
  pendingRanges: MarkdownPlannedRange[]
}

export interface MarkdownWindowParseInput {
  markdown: string
  range?: MarkdownPlannedRange
}

export interface MarkdownWindowParseResult {
  blocks: IBlockSnapshot[]
}
