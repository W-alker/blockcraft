import type {DividerBlockModel, DividerLength, DividerThickness} from "./index";

type DividerProps = DividerBlockModel["props"];

export interface DividerLabelPresentation {
  fontSize: number
  fontWeight: "400" | "700"
  fontStyle: "normal" | "italic"
  letterSpacing: number
}

export interface DividerPresentation {
  style: string
  isTape: boolean
  align: string
  length: DividerLength
  thickness: DividerThickness
  opacity: number
  text: string
  label: DividerLabelPresentation
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
  const fontSize = Number(props.fontSize)
  const letterSpacing = Number(props.letterSpacing)

  return {
    style,
    isTape: style.startsWith("tape"),
    align: props.align ?? "center",
    length: resolveLength(props),
    thickness: resolveThickness(props),
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.1, opacity)) : 1,
    // Template-string coercion, not a string-only filter: a host-written
    // snapshot with a numeric `text` must pick the SAME (labelled) variant on
    // both surfaces — a type filter here while the editor tested raw
    // truthiness was exactly the kind of drift this module exists to prevent.
    text: props.text === null || props.text === undefined ? "" : `${props.text}`,
    label: {
      fontSize: Number.isFinite(fontSize) ? Math.min(32, Math.max(10, fontSize)) : 14,
      fontWeight: props.fontWeight === "bold" ? "700" : "400",
      fontStyle: props.fontStyle === "italic" ? "italic" : "normal",
      letterSpacing: Number.isFinite(letterSpacing) ? Math.min(8, Math.max(0, letterSpacing)) : 0,
    },
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
      return "long"
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
  return props.size === "large" ? "thick" : "regular"
}
