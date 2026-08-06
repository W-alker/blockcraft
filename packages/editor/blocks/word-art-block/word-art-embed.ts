import type {
  DeltaInsert,
  DeltaInsertEmbed,
  EmbedConverter,
} from '../../framework'
import {
  cloneInlineObjectDeltas,
  createInlineObjectAttributes,
  createInlineObjectShell,
  inlineObjectPlainText,
  parseInlineObjectPayload,
  readInlineObjectLayout,
  readInlineObjectWrapFromShell,
  serializeInlineObjectPayload,
  type InlineObjectWrapOptions,
} from '../inline-object'
import {
  normalizeWordArtProps,
  resolveWordArtPresentation,
  type WordArtBlockProps,
} from './word-art.types'

export const INLINE_WORD_ART_EMBED_KEY = 'word-art'

export interface InlineWordArtPayload {
  /** Placement is deliberately omitted at runtime; the full type keeps schema keys typed. */
  props: WordArtBlockProps
  text: DeltaInsert[]
}

export interface InlineWordArtData extends InlineWordArtPayload {
  width: number
  height: number
  wrap?: true
  side?: 'auto' | 'left' | 'right'
  x?: number
  gap?: number
}

const sanitizeText = (value: unknown): DeltaInsert[] => {
  if (!Array.isArray(value)) return []
  const result: DeltaInsert[] = []
  for (const delta of value as DeltaInsert[]) {
    if (typeof delta?.insert === 'string') {
      if (delta.insert) result.push({insert: delta.insert})
    } else if (delta?.insert?.['break']) {
      result.push({insert: {break: '\n'}})
    }
  }
  return result
}

const payloadFromUnknown = (value: unknown): InlineWordArtPayload => {
  const raw = parseInlineObjectPayload<{
    props?: Partial<WordArtBlockProps>
    text?: DeltaInsert[]
  }>(value)
  const props = normalizeWordArtProps(raw?.props)
  const {placement: _placement, ...inlineProps} = props
  return {
    props: inlineProps,
    text: sanitizeText(raw?.text),
  }
}

export function createInlineWordArtDelta(
  props: Partial<WordArtBlockProps> | null | undefined,
  text: readonly DeltaInsert[] = [],
  wrap?: Partial<InlineObjectWrapOptions>,
): DeltaInsertEmbed {
  const normalized = normalizeWordArtProps(props)
  const {placement: _placement, ...inlineProps} = normalized
  const payload: InlineWordArtPayload = {
    props: inlineProps,
    text: sanitizeText(cloneInlineObjectDeltas(text)),
  }
  return {
    insert: {
      [INLINE_WORD_ART_EMBED_KEY]: serializeInlineObjectPayload(payload),
    },
    attributes: createInlineObjectAttributes(
      normalized.width,
      normalized.height,
      wrap,
    ),
  }
}

export function readInlineWordArtDelta(
  delta: DeltaInsertEmbed,
): InlineWordArtData {
  const payload = payloadFromUnknown(delta.insert[INLINE_WORD_ART_EMBED_KEY])
  return {
    ...payload,
    ...readInlineObjectLayout(
      delta,
      payload.props.width,
      payload.props.height,
    ),
  }
}

const findShell = (element: HTMLElement): HTMLElement =>
  element.matches(
    '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
  )
    ? element
    : element.closest<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
    ) ?? element.querySelector<HTMLElement>(
      '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
    ) ?? element

export const createInlineWordArtEmbedConverter = (): EmbedConverter => ({
  toView: delta => {
    const data = readInlineWordArtDelta(delta)
    const presentation = resolveWordArtPresentation({
      ...data.props,
      width: data.width,
      height: data.height,
    })
    const props = presentation.props
    const {shell, frame} = createInlineObjectShell('word-art', data)
    shell.classList.add('bc-inline-word-art-shell')
    frame.classList.add('bc-inline-word-art-frame')
    frame.dataset['bcInlineObjectPayload'] = String(
      delta.insert[INLINE_WORD_ART_EMBED_KEY] ?? '',
    )
    frame.style.transform = props.rotation === 0
      ? ''
      : `rotate(${props.rotation}deg)`
    frame.style.alignItems = props.verticalAlign === 'top'
      ? 'flex-start'
      : props.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'

    const text = document.createElement('span')
    text.classList.add('bc-inline-word-art__text')
    text.dataset['bcWordArtPrintProps'] = JSON.stringify(props)
    text.textContent = inlineObjectPlainText(data.text)
    text.style.fontFamily = presentation.fontFamily
    text.style.fontSize = `${props.fontSize}px`
    text.style.fontWeight = String(props.fontWeight)
    text.style.fontStyle = props.fontStyle
    text.style.letterSpacing = `${props.letterSpacingEm}em`
    text.style.lineHeight = String(props.lineHeight)
    text.style.textAlign = props.horizontalAlign
    text.style.color = presentation.textColor
    text.style.webkitTextFillColor = presentation.textColor
    text.style.caretColor = presentation.fallbackColor
    text.style.backgroundImage = presentation.backgroundImage
    text.style.backgroundClip = 'text'
    text.style.setProperty('-webkit-background-clip', 'text')
    text.style.setProperty('-webkit-text-stroke', presentation.textStroke)
    text.style.textShadow = presentation.textShadow
    text.style.transform = presentation.effectTransform
    frame.appendChild(text)
    return shell
  },
  toDelta: element => {
    const shell = findShell(element)
    const frame = shell.querySelector<HTMLElement>(
      '.bc-inline-word-art-frame',
    )
    const payload = payloadFromUnknown(
      frame?.dataset['bcInlineObjectPayload'],
    )
    return createInlineWordArtDelta(
      {
        ...payload.props,
        width: Number(frame?.style.width.replace('px', '')) ||
          payload.props.width,
        height: Number(frame?.style.height.replace('px', '')) ||
          payload.props.height,
      },
      payload.text,
      readInlineObjectWrapFromShell(shell),
    )
  },
})

export const inlineWordArtEmbedConverter = createInlineWordArtEmbedConverter()
