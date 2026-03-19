import {IBlockSnapshot} from "../../block-std";

export enum ClipboardDataType {
  TEXT = "text/plain",
  HTML = "text/html",
  MARKDOWN = "text/markdown",
  RTF = "text/rtf",
  TSV = "text/tab-separated-values",
  JSON = "application/json",
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
