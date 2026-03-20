import {Observable} from "rxjs";

// ─── Data Types ───

export type MentionType = 'user' | 'doc'

export interface IMentionData {
  id: string
  name: string
  [key: string]: string | number | boolean
}

export interface IMentionResponse {
  list: IMentionData[]
  [key: string]: any
}

// ─── Panel Interface ───

/**
 * IMentionPanel — minimal contract between MentionPlugin and its UI.
 *
 * The plugin (framework layer) handles:
 * - Trigger detection ('@' input)
 * - Anchor tracking (collaboration-safe via Yjs RelativePosition)
 * - Keyword extraction from the delta model → pushed via `onKeywordChange`
 * - Keyboard capture → forwarded via `onKeydown`
 * - Confirm logic (replace @keyword with embed delta)
 * - Lifecycle (open / close / scroll / readonly)
 *
 * The panel (UI layer) handles EVERYTHING else internally:
 * - Data fetching (API calls, filtering, caching)
 * - List rendering, tabs, selection highlight
 * - Keyboard interaction (ArrowUp/Down, Enter, Tab …)
 * - Emitting `onConfirm` when the user picks an item
 *
 * The plugin does NOT know what the panel looks like or how it works.
 */
export interface IMentionPanel {
  /** Reposition the floating panel to a new anchor rect */
  updatePosition(rect: DOMRect): void

  /**
   * Called when the keyword (text after trigger char) changes.
   * The panel uses this to drive its own search / filtering.
   */
  onKeywordChange(keyword: string): void

  /**
   * Forward a captured keyboard event during the mention session.
   * Return `true` if the panel handled it (plugin will preventDefault).
   * Return `false` to let the event propagate to the editor normally.
   *
   * Note: Escape is forwarded here first. If the panel returns `false`,
   * the plugin closes the session.
   */
  onKeydown(event: KeyboardEvent): boolean

  /** Emitted when the user confirms a mention item (click, Enter, etc.) */
  readonly onConfirm: Observable<IMentionData>

  /** Tear down the panel and release resources */
  dispose(): void
}

/**
 * Factory function that creates a mention panel.
 *
 * Called once per @-trigger. The returned panel lives until
 * the mention flow closes (confirm, escape, or cursor leaves).
 */
export type MentionPanelFactory = (ctx: {
  doc: BlockCraft.Doc
  /** The DOMRect of the '@' character — use as initial position anchor */
  rect: DOMRect
}) => IMentionPanel

// ─── Plugin Config ───

export interface MentionPluginConfig {
  /** Factory that creates the floating panel UI */
  panel: MentionPanelFactory
  /** Trigger character (default: '@') */
  trigger?: string
  /** Called when user clicks an existing mention embed in the document */
  onMentionClick?: (id: string, type: string, event: MouseEvent) => void
}
