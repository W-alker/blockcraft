import {IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";

export interface SnapshotViewerOptions {
  rootId?: string
  baseUrl?: string
  resourcePolicy?: SnapshotResourcePolicy
  enhancers?: SnapshotViewerEnhancers
  resolveSvgIcon?: (name: string, signal?: AbortSignal) => Promise<SVGElement | null> | SVGElement | null
}

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
