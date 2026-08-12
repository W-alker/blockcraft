import type {DeltaInsert, EditableBlockComponent} from '../../framework'
import type {IBlockTransformConfig} from './const'

export type SlashCommandGroup = 'basic' | 'inline' | 'media' | 'embed'

export interface SlashCommandContext {
  doc: BlockCraft.Doc
  block: EditableBlockComponent
  query: string
  triggerIndex: number
  triggerLength: number
  /**
   * Collaboration-safe, single-use replacement for the slash trigger and its
   * query. It can be called after an async picker resolves; stale/deleted or
   * readonly targets return false instead of mutating the wrong position.
   */
  replace: (inserts: readonly DeltaInsert[]) => boolean
}

/**
 * A host-owned action appended to the built-in slash menu.
 *
 * Commands receive a collaboration-safe `replace()` operation for their
 * trigger range. Implementations must not mutate contenteditable DOM directly.
 */
export interface SlashCommandItem {
  id: string
  label: string
  group?: SlashCommandGroup
  groupLabel?: string
  description?: string
  keywords?: readonly string[]
  /** Preferred slash-search alias, rendered as `/alias`. */
  searchAlias?: string
  /** Optional host-owned keyboard hint; the command owns the actual binding. */
  shortcutHint?: string
  icon?: string
  svgIcon?: string
  csIcon?: string
  when?: (context: SlashCommandContext) => boolean
  run: (context: SlashCommandContext) => void | Promise<void>
}

export interface BlockTransformerPluginOptions {
  transformList?: readonly IBlockTransformConfig[]
  commands?: readonly SlashCommandItem[]
}

export type SlashMenuItem = {
  id: string
  kind: 'block' | 'heading' | 'command'
  group: SlashCommandGroup
  groupLabel: string
  label: string
  description?: string
  keywords?: readonly string[]
  markdownHint?: string
  shortcutHint?: string
  searchHint?: string
  icon?: string
  svgIcon?: string
  csIcon?: string
  flavour?: string
  heading?: number
  command?: SlashCommandItem
}
