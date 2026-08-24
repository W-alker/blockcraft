import {
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
  type TextBoxWordArtStyle,
} from '../../blocks/text-box-block'
import {
  getWordArtPreset,
  type WordArtPresetId,
} from '../../blocks/word-art-block'

const INHERITED_TEXT_BOX_FONT_SIZE = 16

/** Applies preset visuals without letting the preset replace text sizing. */
export function serializeTextBoxWordArtPreset(
  presetId: WordArtPresetId,
  currentStyle: Readonly<TextBoxWordArtStyle> | null | undefined,
): string | undefined {
  const preset = normalizeTextBoxWordArtStyle(getWordArtPreset(presetId).props)
  if (!preset) return undefined
  return serializeTextBoxWordArtStyle({
    ...preset,
    fontSize: currentStyle?.fontSize ?? INHERITED_TEXT_BOX_FONT_SIZE,
  })
}
