import type {DividerBlockModel, DividerLength, DividerThickness} from "./index";

type DividerProps = DividerBlockModel["props"];

export interface DividerPresentation {
  style: string
  isTape: boolean
  length: DividerLength
  thickness: DividerThickness
  opacity: number
}

/**
 * Resolves divider props (including the deprecated `size`) into the exact values
 * the divider DOM binds. Shared by DividerBlockComponent and the snapshot
 * viewer's divider renderer — the two must stay pixel-identical, so the
 * clamping/fallback rules live here once.
 */
export function resolveDividerPresentation(props: DividerProps): DividerPresentation {
  const style = props.style || "solid"
  const opacity = Number(props.opacity)

  return {
    style,
    isTape: style.startsWith("tape"),
    length: resolveLength(props),
    thickness: resolveThickness(props),
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.1, opacity)) : 1,

  }
}

function resolveLength(props: DividerProps): DividerLength {
  if (props.length === "short" || props.length === "medium"
    || props.length === "long" || props.length === "full") {
    return props.length
  }

  switch (props.size) {
    case "thin":
      return "short"
    case "small":
      return "medium"
    case "large":
      return "full"
    default:
      return props.size == null ? "full" : "long"
  }
}

function resolveThickness(props: DividerProps): DividerThickness {
  if (props.thickness === "thin" || props.thickness === "regular"
    || props.thickness === "thick") {
    return props.thickness
  }

  if (props.size === "thin" || props.size === "small") {
    return "thin"
  }
  return props.size == null ? "thin" : props.size === "large" ? "thick" : "regular"
}
