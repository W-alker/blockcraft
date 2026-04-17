import {IBlockSnapshot} from "../../block-std";
import {ISelectionJSON} from "../selection/types";

export enum ClipboardDataType {
  TEXT = "text/plain",
  HTML = "text/html",
  MARKDOWN = "text/markdown",
  RTF = "text/rtf",
  TSV = "text/tab-separated-values",
  JSON = "application/json",
  BLOCKCRAFT_SNAPSHOT = "application/x-blockcraft-snapshot+json",
  IMAGE = "image/png",
  FILES = "Files",
  URI = "text/uri-list"
}

export type ClipboardPasteFormatType = 'html' | 'plain-text' | 'markdown' | 'table'

export interface ClipboardPasteOption {
  type: ClipboardPasteFormatType
  label: string
  payload: {
    kind: 'text'
    text: string
  } | {
    kind: 'snapshot'
    snapshot: IBlockSnapshot
  }
}

export interface ClipboardPasteSession {
  anchorBlockId: string
  selectedType: ClipboardPasteFormatType
  options: ClipboardPasteOption[]
}

export interface ClipboardPasteSessionView {
  anchorBlockId: string
  selectedType: ClipboardPasteFormatType
  options: Array<Pick<ClipboardPasteOption, 'type' | 'label'>>
}

export interface ClipboardPasteApplyResult {
  anchorBlockId: string
}

/** Emitted by ClipboardManager after a paste with available format alternatives. */
export interface ClipboardPasteCompletedEvent {
  anchorBlockId: string
  appliedType: ClipboardPasteFormatType
  htmlSnapshot: IBlockSnapshot | null
  plainText: string | null
  markdownText: string | null
  /** Serialized selection state from before paste mutations, used to restore after undo. */
  selectionJSON: ISelectionJSON
}
