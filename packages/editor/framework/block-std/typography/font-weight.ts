import type {IInlineNodeAttrs} from '@ccc/blockcraft/framework/model';

/** Numeric CSS weights, including non-preset weights from imported text. */
export function normalizeInlineFontWeight(value: unknown): number | null {
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  const weight = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(weight) && weight >= 1 && weight <= 1000 ? weight : null;
}

/** null inherits the paragraph; legacy bold remains readable as 700. */
export function readInlineFontWeight(attrs: IInlineNodeAttrs): number | null {
  return normalizeInlineFontWeight(attrs['s:fontWeight'] ?? attrs['s:font-weight'])
    ?? (attrs['a:bold'] ? 700 : null);
}

/** Explicit weight owns bold; a bold command removes any old numeric override. */
export function normalizeInlineFontWeightPatch(attrs: IInlineNodeAttrs): IInlineNodeAttrs {
  if (Object.prototype.hasOwnProperty.call(attrs, 's:fontWeight') ||
      Object.prototype.hasOwnProperty.call(attrs, 's:font-weight')) {
    const weight = normalizeInlineFontWeight(attrs['s:fontWeight'] ?? attrs['s:font-weight']);
    return {...attrs, 's:fontWeight': weight === null ? null : String(weight),
      's:font-weight': null, 'a:bold': weight === null ? attrs['a:bold'] ?? null : weight >= 600 ? true : null};
  }
  return Object.prototype.hasOwnProperty.call(attrs, 'a:bold')
    ? {...attrs, 's:fontWeight': null, 's:font-weight': null}
    : attrs;
}
