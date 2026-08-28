import {attachmentBlockAdapters} from '../blocks/attachment-block/adapter'
import {paragraphBlockAdapters} from '../blocks/paragraph-block/adapter'
import {blockquoteBlockAdapters} from '../blocks/blockquote-block/adapter'
import {bookmarkBlockAdapters} from '../blocks/bookmark-block/adapter'
import {orderedBlockAdapters} from '../blocks/ordered-block/adapter'
import {bulletBlockAdapters} from '../blocks/bullet-block/adapter'
import {todoBlockAdapters} from '../blocks/todo-block/adapter'
import {calloutBlockAdapters} from '../blocks/callout-block/adapter'
import {captionBlockAdapters} from '../blocks/caption-block/adapter'
import {codeBlockAdapters} from '../blocks/code-block/adapter'
import {columnsBlockAdapters} from '../blocks/columns-block/adapter'
import {dividerBlockAdapters} from '../blocks/divider-block/adapter'
import {weatherBlockAdapters} from '../blocks/dynamic-material-blocks/weather/adapter'
import {dateCardBlockAdapters} from '../blocks/dynamic-material-blocks/date-card/adapter'
import {personCardBlockAdapters} from '../blocks/dynamic-material-blocks/person-card/adapter'
import {embedBlockAdapters} from '../blocks/embed-blocks/embed-block/adapter'
import {figmaEmbedBlockAdapters} from '../blocks/embed-blocks/figma-embed-block/adapter'
import {juejinEmbedBlockAdapters} from '../blocks/embed-blocks/juejin-embed-block/adapter'
import {formulaBlockAdapters} from '../blocks/formula-block/adapter'
import {frameBlockAdapters} from '../blocks/frame-block/adapter'
import {imageBlockAdapters} from '../blocks/image-block/adapter'
import {mermaidBlockAdapters} from '../blocks/mermaid-block/adapter'
import {objectGroupBlockAdapters} from '../blocks/object-group-block/adapter'
import {pageDividerBlockAdapters} from '../blocks/page-divider-block/adapter'
import {placementLayoutBlockAdapters} from '../blocks/placement-layout/adapter'
import {renderUnitBlockAdapters} from '../blocks/render-unit-block/adapter'
import {rootBlockAdapters} from '../blocks/root-block/adapter'
import {shapeBlockAdapters} from '../blocks/shape-block/adapter'
import {tableBlockAdapters} from '../blocks/table-block/adapter'
import {textBoxBlockAdapters} from '../blocks/text-box-block/adapter'
import {videoBlockAdapters} from '../blocks/video-block/adapter'
import {audioBlockAdapters} from '../blocks/audio-block/adapter'
import {wordArtBlockAdapters} from '../blocks/word-art-block/adapter'
import {demoCoverBlockAdapters} from '../plugins/demo-presentation/blocks/demo-cover/adapter'
import {dateEmbedAdapters} from '../embeds/date/adapter'
import {iconEmbedAdapters} from '../embeds/icon/adapter'
import {imageEmbedAdapters} from '../embeds/image/adapter'
import {latexEmbedAdapters} from '../embeds/latex/adapter'
import {mentionEmbedAdapters} from '../embeds/mention/adapter'
import {shapeEmbedAdapters} from '../embeds/shape/adapter'
import {wordArtEmbedAdapters} from '../embeds/word-art/adapter'
import {AdapterRegistry} from '../adapters/registry'
import type {
  BlockAdapterContribution,
  InlineEmbedAdapterContribution,
} from '../adapters/registry'

export const BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS = [
  rootBlockAdapters,
  paragraphBlockAdapters,
  blockquoteBlockAdapters,
  orderedBlockAdapters,
  bulletBlockAdapters,
  todoBlockAdapters,
  calloutBlockAdapters,
  codeBlockAdapters,
  dividerBlockAdapters,
  pageDividerBlockAdapters,
  imageBlockAdapters,
  tableBlockAdapters,
  attachmentBlockAdapters,
  bookmarkBlockAdapters,
  embedBlockAdapters,
  figmaEmbedBlockAdapters,
  juejinEmbedBlockAdapters,
  captionBlockAdapters,
  mermaidBlockAdapters,
  columnsBlockAdapters,
  formulaBlockAdapters,
  videoBlockAdapters,
  audioBlockAdapters,
  shapeBlockAdapters,
  textBoxBlockAdapters,
  wordArtBlockAdapters,
  objectGroupBlockAdapters,
  placementLayoutBlockAdapters,
  renderUnitBlockAdapters,
  weatherBlockAdapters,
  dateCardBlockAdapters,
  personCardBlockAdapters,
  frameBlockAdapters,
  demoCoverBlockAdapters,
] as const

export const BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS = [
  iconEmbedAdapters,
  imageEmbedAdapters,
  dateEmbedAdapters,
  mentionEmbedAdapters,
  latexEmbedAdapters,
  shapeEmbedAdapters,
  wordArtEmbedAdapters,
] as const

export interface BundledAdapterRegistryOptions {
  readonly additionalBlocks?: readonly BlockAdapterContribution[]
  readonly additionalInlineEmbeds?: readonly InlineEmbedAdapterContribution[]
}

export function createBundledAdapterRegistry(
  options: BundledAdapterRegistryOptions = {},
): AdapterRegistry {
  return new AdapterRegistry(
    [
      ...BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS,
      ...(options.additionalBlocks ?? []),
    ],
    [
      ...BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS,
      ...(options.additionalInlineEmbeds ?? []),
    ],
  )
}

export const BUNDLED_ADAPTER_REGISTRY = createBundledAdapterRegistry()
