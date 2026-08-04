import { PaginationResult } from "../engine";
import {TableCellFlowPlan} from "../engine/table-cell-flow";
import {getTableCellFlowPlan} from "../engine/table-cell-flow-metadata";
import { computeBlockGaps } from "../view/sheet-layout";
import { StablePaginationLayout } from "../view/stable-pagination-layout";
import { computeTableBreaks, TableBreak } from "../view/table-split";
import {
  PaginationGeometryEntry,
  PaginationGeometryMeasurement,
} from "./pagination-geometry-index";
import { PaginationLayoutState } from "./pagination-layout-coordinator";

const NUMERIC_TOLERANCE = 0.01;
const MAX_DIAGNOSTICS = 20;

export type PaginationShadowMismatchKind =
  | "page-count"
  | "slot"
  | "slot-fragment"
  | "used-height"
  | "block-gap"
  | "table-break";

export interface PaginationShadowMismatch {
  readonly kind: PaginationShadowMismatchKind;
  readonly path: string;
  readonly legacy: unknown;
  readonly shadow: unknown;
}

interface TableGeometry {
  readonly id: string;
  readonly flavour: string;
  readonly tableRows?: PaginationGeometryMeasurement['tableRows'];
  readonly tableCellFlowPlan?: TableCellFlowPlan;
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMERIC_TOLERANCE;
}

function fragmentValue(
  fragment:
    | { readonly fromOffset: number; readonly toOffset: number }
    | undefined,
): { fromOffset: number; toOffset: number } | null {
  return fragment
    ? { fromOffset: fragment.fromOffset, toOffset: fragment.toOffset }
    : null;
}

function fragmentsEqual(
  left: { readonly fromOffset: number; readonly toOffset: number } | undefined,
  right: { readonly fromOffset: number; readonly toOffset: number } | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    numbersEqual(left.fromOffset, right.fromOffset) &&
    numbersEqual(left.toOffset, right.toOffset)
  );
}

function sortedUnion(
  left: Iterable<string>,
  right: Iterable<string>,
): readonly string[] {
  return [...new Set([...left, ...right])].sort();
}

function tableGeometryById(
  values: readonly TableGeometry[],
): ReadonlyMap<string, TableGeometry> {
  const byId = new Map<string, TableGeometry>();
  for (const value of values) {
    if (value.flavour === "table" && value.tableRows) {
      byId.set(value.id, {
        id: value.id,
        flavour: value.flavour,
        tableRows: value.tableRows,
        tableCellFlowPlan: getTableCellFlowPlan(value),
      });
    }
  }
  return byId;
}

function shadowTableGeometryById(
  entries: readonly PaginationGeometryEntry[],
): ReadonlyMap<string, TableGeometry> {
  const byId = new Map<string, TableGeometry>();
  for (const entry of entries) {
    if (entry.flavour === "table" && entry.tableRows) {
      byId.set(entry.blockId, {
        id: entry.blockId,
        flavour: entry.flavour,
        tableRows: entry.tableRows,
        tableCellFlowPlan: entry.tableCellFlowPlan,
      });
    }
  }
  return byId;
}

function normalizedTableBreaksById(
  geometryById: ReadonlyMap<string, TableGeometry>,
  result: PaginationResult,
  sheetHeightPx: number,
  pageGap: number,
  contentTop: number,
): ReadonlyMap<string, readonly TableBreak[]> {
  const breaksById = new Map<string, TableBreak[]>();
  for (const [tableId, geometry] of geometryById) {
    if (!geometry.tableRows) continue;
    breaksById.set(tableId, computeTableBreaks(
      tableId,
      [...geometry.tableRows],
      result,
      sheetHeightPx,
      pageGap,
      geometry.tableCellFlowPlan,
      contentTop,
    ));
  }
  return breaksById;
}

function stableValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Number.POSITIVE_INFINITY) return "Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => key !== "revision")
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function comparePaginationShadow(
  legacy: StablePaginationLayout,
  legacyMeasurements: readonly PaginationGeometryMeasurement[],
  shadow: PaginationLayoutState,
): readonly PaginationShadowMismatch[] {
  const mismatches: PaginationShadowMismatch[] = [];
  const add = (
    kind: PaginationShadowMismatchKind,
    path: string,
    legacyValue: unknown,
    shadowValue: unknown,
  ): boolean => {
    mismatches.push({
      kind,
      path,
      legacy: legacyValue,
      shadow: shadowValue,
    });
    return mismatches.length < MAX_DIAGNOSTICS;
  };

  const legacyPages = legacy.result.pages;
  const shadowPages = shadow.result.pages;
  if (
    legacyPages.length !== shadowPages.length &&
    !add("page-count", "pages.length", legacyPages.length, shadowPages.length)
  ) {
    return mismatches;
  }

  const sharedPageCount = Math.min(legacyPages.length, shadowPages.length);
  for (let pageIndex = 0; pageIndex < sharedPageCount; pageIndex++) {
    const legacyPage = legacyPages[pageIndex]!;
    const shadowPage = shadowPages[pageIndex]!;
    if (
      !numbersEqual(legacyPage.usedHeight, shadowPage.usedHeight) &&
      !add(
        "used-height",
        `pages[${pageIndex}].usedHeight`,
        legacyPage.usedHeight,
        shadowPage.usedHeight,
      )
    ) {
      return mismatches;
    }

    const slotCount = Math.max(
      legacyPage.slots.length,
      shadowPage.slots.length,
    );
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      const legacySlot = legacyPage.slots[slotIndex];
      const shadowSlot = shadowPage.slots[slotIndex];
      if (!legacySlot || !shadowSlot) {
        if (
          !add(
            "slot",
            `pages[${pageIndex}].slots[${slotIndex}]`,
            legacySlot?.id ?? null,
            shadowSlot?.id ?? null,
          )
        ) {
          return mismatches;
        }
        continue;
      }

      if (legacySlot.id !== shadowSlot.id) {
        if (
          !add(
            "slot",
            `pages[${pageIndex}].slots[${slotIndex}].id`,
            legacySlot.id,
            shadowSlot.id,
          )
        ) {
          return mismatches;
        }
        continue;
      }

      if (
        !fragmentsEqual(legacySlot.fragment, shadowSlot.fragment) &&
        !add(
          "slot-fragment",
          `pages[${pageIndex}].slots[${slotIndex}].fragment`,
          fragmentValue(legacySlot.fragment),
          fragmentValue(shadowSlot.fragment),
        )
      ) {
        return mismatches;
      }
    }
  }

  const { sheetHeightPx, pageGap } = legacy.geometry;
  const contentTop = legacy.geometry.margins.top + legacy.geometry.headerHeight;
  const legacyGaps = computeBlockGaps(legacy.result, sheetHeightPx, pageGap);
  const shadowGaps = computeBlockGaps(shadow.result, sheetHeightPx, pageGap);
  for (const blockId of sortedUnion(legacyGaps.keys(), shadowGaps.keys())) {
    const legacyGap = legacyGaps.get(blockId);
    const shadowGap = shadowGaps.get(blockId);
    if (
      legacyGap !== undefined &&
      shadowGap !== undefined &&
      numbersEqual(legacyGap, shadowGap)
    ) {
      continue;
    }
    if (
      !add(
        "block-gap",
        `blockGaps[${JSON.stringify(blockId)}]`,
        legacyGap ?? null,
        shadowGap ?? null,
      )
    ) {
      return mismatches;
    }
  }

  const legacyTables = tableGeometryById(legacyMeasurements);
  const shadowTables = shadowTableGeometryById(shadow.entries);
  const legacyBreaksById = normalizedTableBreaksById(
    legacyTables,
    legacy.result,
    sheetHeightPx,
    pageGap,
    contentTop,
  );
  const shadowBreaksById = normalizedTableBreaksById(
    shadowTables,
    shadow.result,
    sheetHeightPx,
    pageGap,
    contentTop,
  );
  for (const tableId of sortedUnion(
    legacyBreaksById.keys(),
    shadowBreaksById.keys(),
  )) {
    const legacyBreaks = legacyBreaksById.get(tableId) ?? [];
    const shadowBreaks = shadowBreaksById.get(tableId) ?? [];
    const breakCount = Math.max(legacyBreaks.length, shadowBreaks.length);
    for (let breakIndex = 0; breakIndex < breakCount; breakIndex++) {
      const legacyBreak = legacyBreaks[breakIndex];
      const shadowBreak = shadowBreaks[breakIndex];
      if (!legacyBreak || !shadowBreak) {
        if (
          !add(
            "table-break",
            `tableBreaks[${JSON.stringify(tableId)}][${breakIndex}]`,
            legacyBreak ?? null,
            shadowBreak ?? null,
          )
        ) {
          return mismatches;
        }
        continue;
      }
      if ('beforeRowId' in legacyBreak && 'beforeRowId' in shadowBreak) {
        if (
          legacyBreak.beforeRowId !== shadowBreak.beforeRowId
          && !add(
            "table-break",
            `tableBreaks[${JSON.stringify(tableId)}][${breakIndex}].beforeRowId`,
            legacyBreak.beforeRowId,
            shadowBreak.beforeRowId,
          )
        ) {
          return mismatches;
        }
        if (
          !numbersEqual(legacyBreak.gap, shadowBreak.gap)
          && !add(
            "table-break",
            `tableBreaks[${JSON.stringify(tableId)}][${breakIndex}].gap`,
            legacyBreak.gap,
            shadowBreak.gap,
          )
        ) {
          return mismatches;
        }
      } else if (
        stableValue(legacyBreak) !== stableValue(shadowBreak)
        && !add(
          "table-break",
          `tableBreaks[${JSON.stringify(tableId)}][${breakIndex}]`,
          legacyBreak,
          shadowBreak,
        )
      ) {
        return mismatches;
      }
    }
  }

  return mismatches;
}

export function shadowMismatchSignature(
  mismatches: readonly PaginationShadowMismatch[],
): string {
  const parts: string[] = [];
  const length = Math.min(mismatches.length, MAX_DIAGNOSTICS);
  for (let index = 0; index < length; index++) {
    const mismatch = mismatches[index]!;
    parts.push(
      [
        mismatch.kind,
        mismatch.path,
        stableValue(mismatch.legacy),
        stableValue(mismatch.shadow),
      ].join("|"),
    );
  }
  return parts.join("\n");
}
