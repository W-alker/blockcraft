import type * as Y from "yjs";
import {IBlockSnapshot} from "../../block-std";
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

/**
 * One endpoint of a {@link PasteRegion}. `rel` is a Yjs RelativePosition anchored
 * inside the block's Y.Text (collaboration-safe, survives concurrent edits). A
 * `null` rel marks a whole-block (`'selected'`) endpoint — e.g. a void block that
 * ended the paste. Treat as opaque: produced and resolved only by ClipboardManager.
 */
export interface PasteRegionPoint {
  blockId: string
  rel: Y.RelativePosition | null
}

/**
 * The span of content a paste produced, captured as relative-position anchors so a
 * later re-apply can select and replace exactly that span — without touching the
 * global undo stack. `start` is always a text point (the insertion offset).
 */
export interface PasteRegion {
  start: PasteRegionPoint
  end: PasteRegionPoint
}

export interface ClipboardPasteApplyResult {
  anchorBlockId: string
  /** The span the apply produced, for a subsequent format switch. Null if it could not be captured. */
  region: PasteRegion | null
}

/** Emitted by ClipboardManager after a paste with available format alternatives. */
export interface ClipboardPasteCompletedEvent {
  anchorBlockId: string
  appliedType: ClipboardPasteFormatType
  htmlSnapshot: IBlockSnapshot | null
  plainText: string | null
  markdownText: string | null
  /** Span of the applied paste, used to select+replace it when switching format. */
  region: PasteRegion | null
  /**
   * Whether the original paste happened at a collapsed cursor (vs. over a range).
   * Collapsed → switching format leaves a collapsed cursor instead of selecting
   * the inserted content.
   */
  collapsed: boolean
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
