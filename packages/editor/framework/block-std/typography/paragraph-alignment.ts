import type {IBlockProps} from '@ccc/blockcraft/framework/model';

const ALIGNMENT_STYLES = {
  left: {textAlign: 'left', textAlignLast: 'auto', textJustify: 'auto'},
  center: {textAlign: 'center', textAlignLast: 'auto', textJustify: 'auto'},
  right: {textAlign: 'right', textAlignLast: 'auto', textJustify: 'auto'},
  justify: {textAlign: 'justify', textAlignLast: 'auto', textJustify: 'auto'},
  distributed: {textAlign: 'justify', textAlignLast: 'justify', textJustify: 'inter-character'},
} as const;
const INHERITED_ALIGNMENT = {textAlign: '', textAlignLast: 'auto', textJustify: 'auto'} as const;

/** CSS projection only; no text/DOM rewriting or layout measurement. */
export function paragraphAlignmentStyles(value: IBlockProps['textAlign'] | 'left' | null | undefined) {
  return value && Object.prototype.hasOwnProperty.call(ALIGNMENT_STYLES, value)
    ? ALIGNMENT_STYLES[value]
    : INHERITED_ALIGNMENT;
}
