import { GALLERY_TEXT_BOX_PRESETS } from "./presets/gallery";
import {
  TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
  type TextBoxBlockProps,
  type TextBoxWritingMode,
} from "./text-box.types";
import {
  createObjectPaint,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
  type ObjectPaint,
  type ObjectPictureFit,
  type ObjectTextFrame,
} from "../../framework";
import { TEXT_BOX_ARTWORK_SCHEME } from "./presets/artwork";
import type {
  ShapeAdjustmentValues,
  ShapeKind,
} from "../shape-block/shape.types";

export type TextBoxPresetPatch = Partial<TextBoxBlockProps>;

export interface TextBoxPresetAuthoringProps {
  sh?: ShapeKind;
  adjustments?: ShapeAdjustmentValues;
  p?:
    | number
    | [number]
    | [number, number]
    | [number, number, number]
    | [number, number, number, number];
  backColor?: string;
  borderColor?: string;
  bw?: number;
  bs?: "solid" | "dashed";
  fo?: number;
  bgi?: string;
  bgs?: ObjectPictureFit;
  bgo?: number;
  wm?: TextBoxWritingMode;
  tc?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800 | 900;
  shadow?: "soft" | "lifted" | "hard-offset" | "neon";
  effect?: "bevel" | "gradient-mesh";
  wa?: null;
}

/** Product-facing gallery groups. The previous three-tab catalog is retired. */
export const TEXT_BOX_PRESET_CATEGORIES = [
  { id: "office", label: "办公经典" },
  { id: "quote", label: "引言" },
  { id: "sidebar", label: "侧边栏" },
  { id: "editorial", label: "杂志" },
  { id: "shape", label: "异形" },
  { id: "bubble", label: "气泡" },
  { id: "note", label: "纸张" },
  { id: "culture", label: "文化风格" },
  { id: "material", label: "材质效果" },
  { id: "vertical", label: "竖排" },
] as const;

export type TextBoxPresetCategory =
  (typeof TEXT_BOX_PRESET_CATEGORIES)[number]["id"];

export interface TextBoxPresetDefinition {
  id: string;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  /** Catalog tab. Omitted entries appear in every tab. */
  cat?: TextBoxPresetCategory;
  /**
   * Directions this preset is offered in. Omitted means both — direction is a
   * frame flag, not a second copy of the data. Callout shapes and purpose-built
   * vertical labels opt into the direction their geometry was designed for.
   */
  wm?: readonly TextBoxWritingMode[];
  props: Readonly<TextBoxPresetAuthoringProps>;
}

/** Resolved catalog entry written directly through DocCRUD/Yjs. */
export interface ResolvedTextBoxPresetDefinition extends Omit<
  TextBoxPresetDefinition,
  "props"
> {
  props: Readonly<TextBoxPresetPatch>;
}

/**
 * The catalog source files intentionally remain compact design data. Convert
 * them at the catalog boundary so every newly inserted preset persists only
 * the unified public object-format contract; this is not a legacy-document
 * migration path.
 */
function canonicalizePreset<T extends TextBoxPresetDefinition>(
  preset: T,
): Omit<T, "props"> & { props: Readonly<TextBoxPresetPatch> } {
  const source = preset.props;
  const defaults = TEXT_BOX_OBJECT_FORMAT_CAPABILITY.defaults;
  const defaultFill = defaults.shapeFill ?? createObjectPaint("solid");
  const defaultOutline = defaults.shapeOutline!;
  const opacity =
    typeof source["fo"] === "number"
      ? Math.min(1, Math.max(0, source["fo"]))
      : 1;
  const image = typeof source["bgi"] === "string" ? source["bgi"].trim() : "";
  const artwork = image.startsWith(TEXT_BOX_ARTWORK_SCHEME) ? image : "";
  const color =
    typeof source["backColor"] === "string"
      ? source["backColor"].trim()
      : defaultFill.type === "solid"
        ? defaultFill.color
        : "#FFFFFF";
  const shapeFill: ObjectPaint =
    source.effect === "gradient-mesh"
      ? {
          type: "linear-gradient",
          angle: 135,
          opacity,
          stops: [
            { color: "#DDF7FF", offset: 0, opacity: 1 },
            { color: "#E8D9FF", offset: 0.48, opacity: 1 },
            { color: "#FFE4D6", offset: 1, opacity: 1 },
          ],
        }
      : image && !artwork
        ? {
            ...createObjectPaint("picture"),
            src: image,
            fit: normalizePictureFit(source["bgs"]),
            opacity:
              typeof source["bgo"] === "number"
                ? Math.min(1, Math.max(0, source["bgo"]))
                : opacity,
          }
        : {
            ...(opacity === 0 || color === "transparent"
              ? { type: "none" as const }
              : {
                  type: "solid" as const,
                  color,
                  opacity,
                }),
          };
  const outlineWidth =
    typeof source["bw"] === "number"
      ? Math.max(0, source["bw"])
      : defaultOutline.width;
  const outlineColor =
    typeof source["borderColor"] === "string"
      ? source["borderColor"].trim()
      : defaultOutline.color;
  const textFrame: ObjectTextFrame = {
    ...defaults.textFrame!,
    margins: normalizeMargins(source["p"], defaults.textFrame!.margins),
    direction: source["wm"] === "v" ? "vertical-rl" : "horizontal",
    horizontalAlign: source.align ?? defaults.textFrame!.horizontalAlign,
    verticalAlign: source.valign ?? defaults.textFrame!.verticalAlign,
  };
  const shadow = source.shadow;
  const shapeEffects = {
    ...defaults.shapeEffects!,
    shadow: shadow
      ? {
          enabled: true,
          color: shadow === "neon" ? "#54E8FF" : "#172334",
          opacity:
            shadow === "hard-offset" ? 0.3 : shadow === "neon" ? 0.55 : 0.2,
          blur: shadow === "hard-offset" ? 0 : shadow === "lifted" ? 22 : 14,
          angle: shadow === "hard-offset" ? 45 : 90,
          distance: shadow === "hard-offset" ? 9 : shadow === "neon" ? 0 : 8,
        }
      : defaults.shapeEffects!.shadow,
    glow:
      source.shadow === "neon" || source.effect === "bevel"
        ? {
            enabled: true,
            color: source.shadow === "neon" ? "#54E8FF" : "#FFFFFF",
            opacity: source.shadow === "neon" ? 0.7 : 0.5,
            radius: source.shadow === "neon" ? 18 : 5,
          }
        : defaults.shapeEffects!.glow,
  };
  const textStyle = {
    ...defaults.textStyle!,
    fontFamily: source.fontFamily ?? defaults.textStyle!.fontFamily,
    fontSize: source.fontSize ?? defaults.textStyle!.fontSize,
    fontWeight: source.fontWeight ?? defaults.textStyle!.fontWeight,
    fill: source.tc
      ? { type: "solid" as const, color: source.tc, opacity: 1 }
      : defaults.textStyle!.fill,
  };
  return {
    ...preset,
    props: {
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      rotation: defaults.rotation,
      lockRatio: defaults.lockAspectRatio,
      shape: source.sh ?? "rectangle",
      ...(source.adjustments
        ? { adjustments: { ...source.adjustments } }
        : {}),
      fill: storeObjectPaint(shapeFill),
      outline: storeObjectLine({
        ...defaultOutline,
        type:
          outlineWidth === 0 || outlineColor === "transparent"
            ? "none"
            : "line",
        color:
          outlineColor === "transparent" ? defaultOutline.color : outlineColor,
        width: outlineWidth,
        dash: source["bs"] === "dashed" ? "dash" : "solid",
      }),
      effects: storeObjectEffects(shapeEffects),
      textFrame: storeObjectTextFrame(textFrame),
      textStyle: storeObjectTextStyle(textStyle),
      ...(artwork ? { artwork } : {}),
    },
  };
}

function normalizeMargins(
  value: unknown,
  fallback: ObjectTextFrame["margins"],
): ObjectTextFrame["margins"] {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 4)) {
    return [...fallback];
  }
  const numbers = value.map((item) =>
    typeof item === "number" && Number.isFinite(item)
      ? Math.min(200, Math.max(0, item))
      : 0,
  );
  return value.length === 2
    ? [numbers[0]!, numbers[1]!, numbers[0]!, numbers[1]!]
    : [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!];
}

function normalizePictureFit(value: unknown): ObjectPictureFit {
  return value === "contain" || value === "stretch" ? value : "cover";
}

/**
 * Word-inspired gallery. IDs from the retired outline/rect/bubble catalog are
 * intentionally absent; choosing an entry persists only concrete appearance.
 */
export const TEXT_BOX_PRESETS = [
  ...GALLERY_TEXT_BOX_PRESETS.map(canonicalizePreset),
] as const satisfies readonly ResolvedTextBoxPresetDefinition[];

const DEFAULT_TEXT_BOX_PRESET = canonicalizePreset(GALLERY_TEXT_BOX_PRESETS[0]);

export type TextBoxPresetId = (typeof TEXT_BOX_PRESETS)[number]["id"];

/**
 * A catalog entry with its id narrowed back to the union. The widened
 * `TextBoxPresetDefinition` view is needed to read optional keys off the
 * `as const` union, but callers that emit a pick still need the literal type.
 */
export type TextBoxPresetEntry = Omit<ResolvedTextBoxPresetDefinition, "id"> & {
  id: TextBoxPresetId;
};

export function getTextBoxPreset(
  value: unknown,
): ResolvedTextBoxPresetDefinition {
  return (
    TEXT_BOX_PRESETS.find((item) => item.id === value) ??
    DEFAULT_TEXT_BOX_PRESET
  );
}

/**
 * Presets offered for a direction. A preset opts out by listing directions
 * explicitly; bundled callout geometry is horizontal-only, while the vertical
 * category carries purpose-built tall frames with vertical text direction.
 */
export function getTextBoxPresetsFor(
  wm: TextBoxWritingMode,
  cat?: TextBoxPresetCategory,
): readonly TextBoxPresetEntry[] {
  // Widened view: the `as const` union drops absent optional keys entirely, so
  // `preset.wm` is unreadable on it. `TEXT_BOX_PRESETS` itself stays literal
  // because `TextBoxPresetId` is derived from it.
  const all: readonly TextBoxPresetEntry[] = TEXT_BOX_PRESETS;
  return all.filter(
    (preset) =>
      (!preset.wm || preset.wm.includes(wm)) &&
      (!cat || !preset.cat || preset.cat === cat),
  );
}

/** Tabs that still have at least one preset in the given direction. */
export function getTextBoxPresetCategoriesFor(
  wm: TextBoxWritingMode,
): readonly { id: TextBoxPresetCategory; label: string }[] {
  return TEXT_BOX_PRESET_CATEGORIES.filter(
    (category) => getTextBoxPresetsFor(wm, category.id).length > 0,
  );
}
