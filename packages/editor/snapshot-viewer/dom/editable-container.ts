import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {InlineModel} from "../../framework/block-std/types/inline.type";
import {SnapshotRenderContext} from "../types";
import {projectAlwaysPlaceholder} from "./always-placeholder";

/**
 * The one editable shell: `.edit-container` + inline content + the
 * always-placeholder projection. Renderers that show the `meta.plh` hint pass
 * their host element; opting OUT is the explicit absence of `host` (the
 * code/mermaid highlight containers are restructured by shiki and cannot carry
 * the hint), never a forgotten extra call — a per-renderer projection call is
 * exactly how the word-art path shipped without hints.
 */
export function createEditableContainer(
  ctx: SnapshotRenderContext,
  snapshot: IBlockSnapshot,
  options: {tag?: "div" | "pre", host?: HTMLElement} = {},
): HTMLElement {
  const content = document.createElement(options.tag ?? "div")
  content.classList.add("edit-container")
  if (snapshot.flavour !== "code" && snapshot.props.textAlign) {
    content.style.textAlign = `${snapshot.props.textAlign}`
  }
  content.append(ctx.createInlineContent(snapshot.children as InlineModel))
  if (options.host) {
    projectAlwaysPlaceholder(options.host, content, snapshot)
  }
  return content
}
