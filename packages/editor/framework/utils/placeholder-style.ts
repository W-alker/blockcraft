import {
  inlineFontSizeCss,
  normalizeParagraphTextDefaults,
  resolveTypographyFontFamily,
} from '../block-std/typography';

/** Internal presentation shared by the editor and snapshot hints; no layout reads. */
export default function projectPlaceholderStyle(target: HTMLElement, textDefaults?: unknown): void {
  const attrs = normalizeParagraphTextDefaults(textDefaults);
  const styles = {
    'font-family': resolveTypographyFontFamily(attrs['t:ff']) ?? attrs['s:fontFamily'] ??
      (attrs['a:code'] ? 'monospace' : null),
    'font-size': inlineFontSizeCss(attrs['t:px'], attrs['t:fs']) ?? attrs['s:fontSize'] ??
      (attrs['a:sub'] || attrs['a:sup'] ? 'small' : null),
    'font-weight': attrs['s:fontWeight'] ?? (attrs['a:bold'] ? 'bolder' : null),
    'font-style': attrs['a:italic'] ? 'italic' : null,
    'letter-spacing': attrs['t:ls'] !== undefined ? `${attrs['t:ls']}em` : attrs['s:letterSpacing'],
    'text-decoration': [attrs['a:underline'] && 'underline', attrs['a:strike'] && 'line-through']
      .filter(Boolean).join(' '),
  };
  for (const [property, value] of Object.entries(styles)) {
    const variable = `--_bc-placeholder-${property}`;
    if (value) target.style.setProperty(variable, value);
    else target.style.removeProperty(variable);
  }
}
