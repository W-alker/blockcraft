import type {
  BlockObjectFormatCapability,
  BlockObjectFormatProps,
  NormalizedBlockObjectFormat,
  ObjectFormatFeatureSet,
  ObjectFormatPatch,
  ObjectLine,
  ObjectPaint,
} from "../block-std/block/object-format";
import {
  normalizeBlockObjectFormat,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from "../block-std/block/object-format";
import type { IBlockProps } from "../block-std/types";

const FORMAT_KEYS = [
  "width",
  "height",
  "rotation",
  "lockAspectRatio",
  "shapeType",
  "shapeFill",
  "shapeOutline",
  "shapeEffects",
  "textFrame",
  "textStyle",
] as const;

const PERSISTED_FORMAT_KEYS = {
  width: "width",
  height: "height",
  rotation: "rotation",
  lockAspectRatio: "lockRatio",
  shapeType: "shape",
  shapeFill: "fill",
  shapeOutline: "outline",
  shapeEffects: "effects",
  textFrame: "textFrame",
  textStyle: "textStyle",
} as const satisfies Record<ObjectFormatKey, keyof BlockObjectFormatProps>;

export type ObjectFormatKey = (typeof FORMAT_KEYS)[number];

export interface ObjectFormatValue<T> {
  mixed: boolean;
  value: T | undefined;
}

export type ObjectFormatValues = {
  [K in keyof NormalizedBlockObjectFormat]-?: ObjectFormatValue<
    NonNullable<NormalizedBlockObjectFormat[K]>
  >;
};

export interface BlockObjectFormatTarget {
  blockId: string;
  flavour: string;
  readonly: boolean;
  capability: BlockObjectFormatCapability;
  shapeTypes: readonly string[];
  format: NormalizedBlockObjectFormat;
}

export interface BlockObjectFormatSelectionState {
  blockIds: readonly string[];
  targets: readonly BlockObjectFormatTarget[];
  features: ObjectFormatFeatureSet;
  shapeTypes: readonly string[];
  values: ObjectFormatValues;
  readonlyCount: number;
}

export interface BlockObjectFormatUpdateResult {
  applied: boolean;
  updatedIds: readonly string[];
  skippedReadonlyIds: readonly string[];
  reason?: "selection-changed" | "target-missing" | "unsupported";
}

/**
 * Model-only object-format facade shared by toolbars, exporters and hosts.
 * Every section is persisted under one compact top-level prop so Yjs observes
 * one atomic value and independent sections cannot overwrite each other.
 */
export class BlockObjectFormatManager {
  constructor(private readonly doc: BlockCraft.Doc) {}

  getCapability(flavour: string): BlockObjectFormatCapability | null {
    return this.doc.schemas.get(flavour, false)?.metadata.objectFormat ?? null;
  }

  getCapabilityForBlock(blockId: string): BlockObjectFormatCapability | null {
    const flavour = this.doc.model.getFlavour(blockId);
    return typeof flavour === "string" ? this.getCapability(flavour) : null;
  }

  resolve(blockId: string): NormalizedBlockObjectFormat | null {
    const flavour = this.doc.model.getFlavour(blockId);
    if (typeof flavour !== "string") return null;
    const capability = this.getCapability(flavour);
    const props = this.doc.model.getProps(blockId);
    if (!capability || !props) return null;
    return normalizeBlockObjectFormat(
      props as Partial<BlockObjectFormatProps>,
      capability,
    );
  }

  /** Resolve object IDs from the current model selection, never from DOM. */
  getSelectionIds(
    selection: BlockCraft.Selection | null | undefined = this.doc.selection
      .value,
  ): string[] | null {
    if (!selection) return null;
    const absoluteIds =
      this.doc.placement.getAbsoluteObjectSelectionIds(selection);
    if (absoluteIds?.length) {
      return absoluteIds.every((id) => this.getCapabilityForBlock(id))
        ? absoluteIds
        : null;
    }
    if (
      selection.isInSameBlock &&
      selection.anchor.type === "selected" &&
      selection.head.type === "selected" &&
      selection.anchor.blockId === selection.head.blockId &&
      this.getCapabilityForBlock(selection.anchor.blockId)
    ) {
      return [selection.anchor.blockId];
    }
    return null;
  }

  readSelection(
    blockIds: readonly string[] | null = this.getSelectionIds(),
  ): BlockObjectFormatSelectionState | null {
    if (!blockIds?.length || new Set(blockIds).size !== blockIds.length)
      return null;
    const targets: BlockObjectFormatTarget[] = [];
    for (const blockId of blockIds) {
      const flavour = this.doc.model.getFlavour(blockId);
      const props = this.doc.model.getProps(blockId);
      if (typeof flavour !== "string" || !props) return null;
      const capability = this.getCapability(flavour);
      if (!capability) return null;
      targets.push({
        blockId,
        flavour,
        capability,
        shapeTypes: resolveTargetShapeTypes(this.doc, blockId, capability),
        readonly: this.doc.readonlyManager.isReadonly(blockId),
        format: normalizeBlockObjectFormat(
          props as Partial<BlockObjectFormatProps>,
          capability,
        ),
      });
    }
    const features = intersectFeatures(targets);
    return {
      blockIds: [...blockIds],
      targets,
      features,
      shapeTypes: intersectShapeTypes(targets),
      values: collectValues(targets, features),
      readonlyCount: targets.filter((target) => target.readonly).length,
    };
  }

  /**
   * Apply one patch to every still-selected writable target. Selection and
   * target existence are checked before entering the single Yjs transaction.
   */
  updateSelection(
    expectedBlockIds: readonly string[],
    patch: Readonly<ObjectFormatPatch>,
    options: Readonly<{ allowDetachedSelection?: boolean }> = {},
  ): BlockObjectFormatUpdateResult {
    const currentIds = this.getSelectionIds();
    const ownsDetachedSelection =
      options.allowDetachedSelection === true && currentIds === null;
    if (!sameIds(currentIds, expectedBlockIds) && !ownsDetachedSelection) {
      return emptyResult("selection-changed");
    }
    const state = this.readSelection(expectedBlockIds);
    if (!state) return emptyResult("target-missing");
    const writable = state.targets.filter((target) => !target.readonly);
    const skippedReadonlyIds = state.targets
      .filter((target) => target.readonly)
      .map((target) => target.blockId);
    const updates = writable.flatMap((target) => {
      const props = this.doc.model.getProps(target.blockId);
      if (!props) return [];
      const next = buildPersistentPatch(
        props as Partial<BlockObjectFormatProps>,
        target.capability,
        target.shapeTypes,
        patch,
      );
      return Object.keys(next).length
        ? [{ blockId: target.blockId, props: next }]
        : [];
    });
    if (!updates.length) {
      return {
        applied: false,
        updatedIds: [],
        skippedReadonlyIds,
        reason: "unsupported",
      };
    }
    this.doc.crud.transact(() => {
      for (const update of updates) {
        this.doc.crud.updateBlockProps(update.blockId, update.props);
      }
    }, this);
    return {
      applied: true,
      updatedIds: updates.map((update) => update.blockId),
      skippedReadonlyIds,
    };
  }
}

function buildPersistentPatch(
  current: Partial<BlockObjectFormatProps>,
  capability: BlockObjectFormatCapability,
  allowedShapeTypes: readonly string[],
  patch: Readonly<ObjectFormatPatch>,
): Partial<IBlockProps> {
  const currentFormat = normalizeBlockObjectFormat(current, capability);
  const candidate = { ...current } as Record<string, unknown>;
  for (const key of FORMAT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (!supportsKey(capability, allowedShapeTypes, key, value)) continue;
    const persistedKey = PERSISTED_FORMAT_KEYS[key];
    if (value === null) {
      delete candidate[persistedKey];
    } else if (value !== undefined) {
      candidate[persistedKey] = storeFormatValue(key, value);
    }
  }
  const nextLock =
    patch.lockAspectRatio === null
      ? capability.defaults.lockAspectRatio
      : (patch.lockAspectRatio ?? currentFormat.lockAspectRatio);
  const changesWidth = typeof patch.width === "number";
  const changesHeight = typeof patch.height === "number";
  if (nextLock && changesWidth !== changesHeight) {
    if (changesWidth) {
      candidate["height"] =
        (patch.width! * currentFormat.height) / currentFormat.width;
    } else {
      candidate["width"] =
        (patch.height! * currentFormat.width) / currentFormat.height;
    }
  }
  const normalized = normalizeBlockObjectFormat(
    candidate as Partial<BlockObjectFormatProps>,
    capability,
  );
  const persistent: Partial<IBlockProps> = {};
  for (const key of FORMAT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (!supportsKey(capability, allowedShapeTypes, key, patch[key])) continue;
    const persistedKey = PERSISTED_FORMAT_KEYS[key];
    if (patch[key] === null) {
      persistent[persistedKey] = null;
      continue;
    }
    const value = normalized[key];
    if (value === undefined) continue;
    persistent[persistedKey] = storeFormatValue(key, value) as never;
  }
  if (nextLock && changesWidth !== changesHeight) {
    const coupledKey = changesWidth ? "height" : "width";
    persistent[coupledKey] = normalized[coupledKey];
  }
  return persistent;
}

function storeFormatValue(key: ObjectFormatKey, value: unknown): unknown {
  if (key === "shapeFill") return storeObjectPaint(value as ObjectPaint);
  if (key === "shapeOutline") return storeObjectLine(value as ObjectLine);
  if (key === "shapeEffects") return storeObjectEffects(value as never);
  if (key === "textFrame") return storeObjectTextFrame(value as never);
  if (key === "textStyle") return storeObjectTextStyle(value as never);
  return value;
}

function supportsKey(
  capability: BlockObjectFormatCapability,
  allowedShapeTypes: readonly string[],
  key: ObjectFormatKey,
  value: unknown,
): boolean {
  if (
    key === "width" ||
    key === "height" ||
    key === "rotation" ||
    key === "lockAspectRatio"
  ) {
    return capability.features.geometry;
  }
  if (key === "shapeType") {
    return (
      capability.features.shape &&
      (value === null ||
        (typeof value === "string" && allowedShapeTypes.includes(value)))
    );
  }
  if (key === "shapeOutline" || key === "shapeEffects") {
    return capability.features.shape;
  }
  if (key === "shapeFill") {
    if (!capability.features.shape) return false;
    return !isPicturePaint(value) || capability.features.pictureFill;
  }
  if (key === "textFrame") return capability.features.textFrame;
  if (key !== "textStyle" || !capability.features.textStyle) return false;
  const textFill =
    value && typeof value === "object"
      ? (value as { fill?: unknown }).fill
      : undefined;
  return !isPicturePaint(textFill) || capability.features.pictureFill;
}

function isPicturePaint(value: unknown): value is ObjectPaint {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as ObjectPaint).type === "picture",
  );
}

function intersectFeatures(
  targets: readonly BlockObjectFormatTarget[],
): ObjectFormatFeatureSet {
  const capabilities = targets.map((target) => target.capability);
  const every = (
    key: "geometry" | "shape" | "pictureFill" | "lineArrows" | "textFrame",
  ) => capabilities.every((capability) => capability.features[key]);
  const textModes = capabilities.map(
    (capability) => capability.features.textStyle,
  );
  return {
    geometry: every("geometry"),
    shape: every("shape"),
    pictureFill: every("pictureFill"),
    lineArrows:
      every("lineArrows") &&
      targets.every((target) =>
        Boolean(
          target.format.shapeType &&
          target.capability.lineArrowShapeTypes?.includes(
            target.format.shapeType,
          ),
        ),
      ),
    textFrame: every("textFrame"),
    textStyle: textModes.every(Boolean)
      ? textModes.every((mode) => mode === "uniform")
        ? "uniform"
        : "rich-default"
      : false,
  };
}

function intersectShapeTypes(
  targets: readonly BlockObjectFormatTarget[],
): string[] {
  if (
    !targets.length ||
    targets.some((target) => !target.capability.features.shape)
  ) {
    return [];
  }
  const [first, ...rest] = targets;
  return [...(first?.shapeTypes ?? [])].filter((shapeType) =>
    rest.every((target) => target.shapeTypes.includes(shapeType)),
  );
}

function resolveTargetShapeTypes(
  doc: BlockCraft.Doc,
  blockId: string,
  capability: BlockObjectFormatCapability,
): string[] {
  const shapeTypes = [...(capability.shapeTypes ?? [])];
  if (!capability.textlessShapeTypes?.length) return shapeTypes;
  const hasText = doc.model
    .getChildrenIds(blockId)
    .some(
      (childId) =>
        doc.model.getTextLength(childId) > 0 ||
        doc.model.getChildrenIds(childId).length > 0,
    );
  return hasText
    ? shapeTypes.filter(
        (type) => !capability.textlessShapeTypes!.includes(type),
      )
    : shapeTypes;
}

function collectValues(
  targets: readonly BlockObjectFormatTarget[],
  features: ObjectFormatFeatureSet,
): ObjectFormatValues {
  return Object.fromEntries(
    FORMAT_KEYS.map((key) => {
      const supported =
        key === "shapeType" ||
        key === "shapeFill" ||
        key === "shapeOutline" ||
        key === "shapeEffects"
          ? features.shape
          : key === "textFrame"
            ? features.textFrame
            : key === "textStyle"
              ? Boolean(features.textStyle)
              : features.geometry;
      if (!supported) return [key, { mixed: false, value: undefined }];
      const values = targets.map((target) => target.format[key]);
      const first = values[0];
      const mixed = values.slice(1).some((value) => !deepEqual(first, value));
      return [key, { mixed, value: mixed ? undefined : first }];
    }),
  ) as unknown as ObjectFormatValues;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.prototype.hasOwnProperty.call(right, key) &&
        deepEqual(left[key], right[key]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function sameIds(
  actual: readonly string[] | null,
  expected: readonly string[],
): boolean {
  return Boolean(
    actual &&
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index]),
  );
}

function emptyResult(
  reason: BlockObjectFormatUpdateResult["reason"],
): BlockObjectFormatUpdateResult {
  return { applied: false, updatedIds: [], skippedReadonlyIds: [], reason };
}
