import {IBlockSnapshot} from "../../block-std";
import {ISelectionJSON} from "../selection/types";
import {SimpleBasicType} from "../../../global";

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

/** Context passed to filter predicates / transforms. */
export interface CopyFilterContext {
  /** Where the copy originated: keyboard/selection copy vs. programmatic block copy. */
  source: 'selection' | 'programmatic'
  readonly: boolean
}

/**
 * A single copy filter. Declarative fields cover common cases; `transform`
 * is the escape hatch (runs last). Filters are composed in registration order.
 */
export interface ClipboardCopyFilter {
  /** Exclude whole blocks (with their subtree) by flavour. */
  excludeFlavours?: BlockCraft.BlockFlavour[]
  /** Predicate exclusion: return `true` to drop the block and its subtree. */
  excludeBlock?: (snapshot: IBlockSnapshot, ctx: CopyFilterContext) => boolean
  /** Strip inline delta attribute keys. Array = key membership; function = `true` to strip. */
  stripAttributes?: string[] | ((key: string, value: SimpleBasicType) => boolean)
  /**
   * Escape hatch: arbitrary transform after declarative rules. Receives a private
   * clone of the snapshot (safe to mutate in place and return). Must return a snapshot;
   * returning nothing is ignored and the prior tree is kept.
   */
  transform?: (root: IBlockSnapshot, ctx: CopyFilterContext) => IBlockSnapshot
  // Reserved for later: stripProps? / stripMeta?
}
