import {normalizeInlineFontWeight} from './font-weight';
import type {IEditableBlockProps, IInlineNodeAttrs, ParagraphNextStyle} from '@ccc/blockcraft/framework/model';
import {
  isTypographyFontFamilyId, normalizeFontSizePixels, normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
} from './core';

/** 段落标记只保存字符外观，链接和业务/修订属性仍归文本本身。 */
export function normalizeParagraphTextDefaults(value: unknown): IInlineNodeAttrs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: IInlineNodeAttrs = {};
  for (const key of ['a:bold', 'a:italic', 'a:underline', 'a:strike', 'a:code', 'a:sub', 'a:sup']) {
    if (input[key] === true) result[key] = true;
  }
  for (const key of ['s:color', 's:background', 's:fontFamily', 's:fontSize', 's:letterSpacing']) {
    if (typeof input[key] === 'string' && input[key]) result[key] = input[key] as string;
  }
  const weight = normalizeInlineFontWeight(input['s:fontWeight'] ?? input['s:font-weight']);
  if (weight !== null) result['s:fontWeight'] = String(weight);
  if (isTypographyFontFamilyId(input['t:ff'])) result['t:ff'] = input['t:ff'];
  for (const [key, normalize] of [
    ['t:px', normalizeFontSizePixels], ['t:fs', normalizeInlineFontScale], ['t:ls', normalizeInlineLetterSpacing],
  ] as const) {
    const normalized = normalize(input[key]);
    if (normalized !== null) result[key] = normalized;
  }
  return result;
}

export function normalizeParagraphNextStyle(value: unknown): ParagraphNextStyle | undefined {
  return value === 'same' || value === 'body' ? value : undefined;
}

export interface NextParagraphStyle<F extends string = string> {
  flavour: F | 'paragraph';
  props: Partial<IEditableBlockProps>;
  /** false 表示切换到正文，不继续当前段落的字符覆盖。 */
  continueTextFormat: boolean;
}

/** 只处理现有段落语义；自定义块和专属输入由其现有扩展点负责。 */
export function resolveNextParagraphStyle<F extends string>(
  flavour: F,
  props: Partial<IEditableBlockProps>,
  atEnd: boolean,
): NextParagraphStyle<F> {
  const paragraphFamily = ['paragraph', 'bullet', 'ordered', 'todo', 'blockquote'].includes(flavour);
  const next = atEnd && paragraphFamily
    ? normalizeParagraphNextStyle(props.nextParagraphStyle) ?? (props.heading || flavour === 'blockquote' ? 'body' : 'same')
    : 'same';
  if (next === 'body') return {flavour: 'paragraph', props: {depth: 0}, continueTextFormat: false};
  const inherited = {...props};
  // 新列表项继续标记样式，起始编号与完成状态属于旧项。
  for (const key of ['order', 'start', 'continuePrevious', 'checked']) delete inherited[key];
  return {flavour, props: inherited, continueTextFormat: true};
}
