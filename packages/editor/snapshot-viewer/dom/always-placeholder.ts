import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {DeltaInsert} from "../../framework/block-std/types/delta.type";

/**
 * "Always" placeholders in the snapshot viewer.
 *
 * The editor's PlaceholderPlugin renders `meta.plh` through a pure CSS contract:
 * `data-placeholder` + `.bc-placeholder-target` on the editable container and
 * `.empty.bc-placeholder-empty` on the host (see themes/base.scss). Snapshots are
 * read-only, so only the `plhMode: "always"` variant is meaningful here — focus
 * driven placeholders have no cursor to react to. Template previews rely on this:
 * fill-in regions carry their hint text exclusively in `meta.plh`.
 */

export function alwaysPlaceholderText(snapshot: IBlockSnapshot): string | null {
  const meta = snapshot.meta as Record<string, unknown> | undefined
  if (meta?.["plhMode"] !== "always") {
    return null
  }
  const text = meta["plh"]
  return typeof text === "string" && text ? text : null
}

/** True when the block would show its always-placeholder: editable, hint present, no content. */
export function alwaysPlaceholderVisible(snapshot: IBlockSnapshot): boolean {
  if (snapshot.nodeType !== BlockNodeType.editable && `${snapshot.nodeType}` !== "editable") {
    return false
  }
  if (!alwaysPlaceholderText(snapshot)) {
    return false
  }
  return inlineModelIsEmpty(snapshot.children as DeltaInsert[])
}

/** Applies the editor's placeholder CSS contract onto a rendered editable block. */
export function projectAlwaysPlaceholder(
  host: HTMLElement,
  container: HTMLElement,
  snapshot: IBlockSnapshot,
): void {
  if (!alwaysPlaceholderVisible(snapshot)) {
    return
  }
  container.setAttribute("data-placeholder", alwaysPlaceholderText(snapshot)!)
  container.classList.add("bc-placeholder-target")
  host.classList.add("empty", "bc-placeholder-empty")
  // The hint itself is an absolutely-positioned ::before (it must not take part
  // in layout), so the empty container needs a real line box behind it — the
  // same job contenteditable's filler <br> does in the editor. Without it the
  // block collapses to zero height and the hint bleeds out of its parent.
  container.append(document.createElement("br"))
}

function inlineModelIsEmpty(model: DeltaInsert[]): boolean {
  if (!Array.isArray(model)) {
    return true
  }
  return model.every(item => typeof item.insert === "string" && item.insert === "")
}
