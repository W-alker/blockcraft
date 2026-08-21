import {IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";
import {DeltaInsertEmbed} from "../framework/block-std/types/delta.type";

export interface SnapshotViewerOptions {
  rootId?: string
  baseUrl?: string
  resourcePolicy?: SnapshotResourcePolicy
  enhancers?: SnapshotViewerEnhancers
  resolveSvgIcon?: (name: string, signal?: AbortSignal) => Promise<SVGElement | null> | SVGElement | null
  /**
   * Custom block renderers, matched BEFORE the builtin registry (first
   * `canRender` wins, the generic fallback stays last). A renderer without
   * `patch` is updated via attribute/child-node sync of a fresh render, so
   * the produced DOM must stay stateless — register cleanups through
   * `ctx.registerDisposable` if the DOM owns listeners or controllers. A
   * renderer WITH `patch` owns its whole subtree: the engine delegates the
   * update to it and stops tracking its children.
   * Container-style renderers mark the element that hosts child blocks with
   * the `data-bc-snapshot-children` attribute; that container must hold ONLY
   * child-block elements (children are reconciled positionally — decorative
   * nodes inside it get trimmed on update), and a marker inside a nested
   * block belongs to that block, not to an unmarked ancestor.
   */
  blockRenderers?: SnapshotBlockRenderer[]
  /**
   * Custom inline embed views keyed by embed name (the single key of the
   * delta's `insert` object). Matched before the builtin latex/mention
   * views; a renderer that throws falls back to the generic embed chip.
   * Applied on first render and on incremental `update()` patches alike.
   */
  inlineEmbeds?: Record<string, SnapshotInlineEmbedRenderer>
}

export type SnapshotInlineEmbedRenderer = (delta: DeltaInsertEmbed) => HTMLElement

export interface SnapshotRenderer {
  render(container: HTMLElement, snapshot: IBlockSnapshot | IBlockSnapshot[]): void
  update(snapshot: IBlockSnapshot | IBlockSnapshot[]): void
  destroy(): void
}

export interface NormalizedSnapshot {
  root: IBlockSnapshot
}

export interface SnapshotRenderResult {
  element: HTMLElement
}

export interface MountedSnapshotNode {
  snapshot: IBlockSnapshot
  element: HTMLElement
  children: MountedSnapshotNode[]
}

export interface SnapshotRenderContext {
  renderBlock(snapshot: IBlockSnapshot): HTMLElement
  createInlineContent(model: InlineModel): DocumentFragment
  scheduleEnhancement(task: SnapshotEnhancementTask): void
  registerDisposable?(target: Element, cleanup: () => void): void
  options: SnapshotViewerOptions
}

export interface SnapshotBlockRenderer {
  canRender(snapshot: IBlockSnapshot): boolean
  render(ctx: SnapshotRenderContext, snapshot: IBlockSnapshot): SnapshotRenderResult
  patch?(ctx: SnapshotRenderContext, current: MountedSnapshotNode, next: IBlockSnapshot): void
}

export type SnapshotResourcePolicy = "eager" | "visible" | "off"

export interface SnapshotEnhancementTask<T = unknown> {
  key: string
  target: Element
  policy?: Exclude<SnapshotResourcePolicy, "off">
  load(signal: AbortSignal): Promise<T> | T
  apply(value: T): void
}

export interface SnapshotBookmarkPreviewData {
  title?: string
  description?: string
  image?: string
  icon?: string
}

export interface SnapshotViewerEnhancers {
  bookmark?: {
    load(url: string, signal: AbortSignal): Promise<SnapshotBookmarkPreviewData> | SnapshotBookmarkPreviewData
  }
  formula?: {
    render(latex: string, signal: AbortSignal): Promise<string> | string
  }
  mermaid?: {
    render(source: string, signal: AbortSignal): Promise<string> | string
  }
}
