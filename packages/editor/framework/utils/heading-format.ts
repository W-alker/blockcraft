import type {IBlockProps, IEditableBlockProps, IInlineNodeAttrs} from '../model';

/** @internal Applying a heading resets size overrides, not other character formatting. */
export const HEADING_SIZE_RESET: IInlineNodeAttrs = {
  't:px': null,
  't:fs': null,
  's:fontSize': null,
  's:font-size': null,
  's:lineHeight': null,
  's:line-height': null,
};

/** @internal Also used for empty-paragraph defaults and pending typing attributes. */
export function withoutHeadingSize(attrs: IInlineNodeAttrs = {}): IInlineNodeAttrs {
  const result = {...attrs};
  for (const key of Object.keys(HEADING_SIZE_RESET)) delete result[key];
  return result;
}

/** @internal Removing a heading retains the existing plain-paragraph command semantics. */
export function headingPropsPatch(
  props: Partial<IEditableBlockProps>, heading: number | null,
): Partial<IBlockProps> {
  if (heading === null) return {heading: null};
  const patch: Partial<IEditableBlockProps> = {heading, fs: null, pfs: null, lh: null};
  if (props.textDefaults && Object.keys(HEADING_SIZE_RESET).some(key => key in props.textDefaults!)) {
    const defaults = withoutHeadingSize(props.textDefaults);
    patch.textDefaults = Object.keys(defaults).length ? defaults : null;
  }
  return patch;
}
