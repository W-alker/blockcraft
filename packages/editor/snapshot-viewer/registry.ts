import {BlockNodeType, IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";
import {createBlockShell} from "./dom/create-block-shell";
import {createEmbedRenderers} from "./renderers/embed-renderers";
import {createMediaRenderers} from "./renderers/media-renderers";
import {createStructuralRenderers} from "./renderers/structural-renderers";
import {createTextRenderers} from "./renderers/text-renderers";
import {createWordArtRenderers} from "./renderers/word-art-renderers";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "./types";

const DEFAULT_SNAPSHOT_BLOCK_RENDERER: SnapshotBlockRenderer = {
  canRender: () => true,
  render(ctx: SnapshotRenderContext, snapshot: IBlockSnapshot) {
    const element = createBlockShell(snapshot)

    if (snapshot.nodeType === BlockNodeType.editable) {
      const content = document.createElement("div")
      content.classList.add("edit-container")
      content.append(ctx.createInlineContent(snapshot.children as InlineModel))
      element.append(content)
      return {element}
    }

    if (Array.isArray(snapshot.children)) {
      for (const child of snapshot.children) {
        element.append(ctx.renderBlock(child))
      }
    }

    return {element}
  },
}

export function createBuiltinRendererRegistry(): SnapshotBlockRenderer[] {
  return [
    ...createStructuralRenderers(),
    ...createWordArtRenderers(),
    ...createTextRenderers(),
    ...createMediaRenderers(),
    ...createEmbedRenderers(),
    DEFAULT_SNAPSHOT_BLOCK_RENDERER,
  ]
}
