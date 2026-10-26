import {SnapshotViewerOptions} from "../types";
import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import type {
  AdapterRegistry,
  MarkdownAdapterProfile,
} from "../../adapters";

export interface MarkdownStreamViewerOptions {
  container?: HTMLElement
  viewerOptions?: SnapshotViewerOptions
  adapterRegistry?: AdapterRegistry
  markdownProfile?: MarkdownAdapterProfile
  onError?: (error: unknown) => void
}

export interface MarkdownStreamViewer {
  append(chunk: string): void
  replace(markdown: string): void
  finish(): void
  destroy(): void
}

export interface MarkdownStreamParseInput {
  markdown: string
}

export interface MarkdownStreamParseResult {
  blocks: IBlockSnapshot[]
}
