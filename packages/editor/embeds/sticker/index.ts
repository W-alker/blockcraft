import type {EmbedConverter, DeltaInsertEmbed} from '../../framework'
import {createStickerProps, type StickerBlockProps} from '../../blocks/sticker-block'
import {getStickerPreset, renderStickerDataUrl} from '../../blocks/sticker-block/presets'
import {resolveStickerDimensions, normalizeStickerRotation} from '../../blocks/sticker-block/sticker-size'
import {
  createInlineObjectAttributes,
  createInlineObjectShell,
  parseInlineObjectPayload,
  readInlineObjectLayout,
  readInlineObjectWrapFromShell,
  serializeInlineObjectPayload,
  type InlineObjectWrapOptions,
} from '../../blocks/inline-object'

export const INLINE_STICKER_EMBED_KEY = 'sticker'

export interface InlineStickerData {
  props: StickerBlockProps
  width: number
  height: number
  wrap?: true
  x?: number
  gap?: number
}

const normalizeProps = (raw?: Partial<StickerBlockProps>): StickerBlockProps => {
  const id = raw?.presetId
  const version = raw?.presetVersion
  const props = createStickerProps(
    typeof id === 'string' ? id : undefined,
    typeof version === 'number' && Number.isFinite(version) ? version : undefined,
    raw?.colors,
  )
  const rotation = normalizeStickerRotation(raw?.rotation)
  return {...props, ...(rotation ? {rotation} : {})}
}

const readProps = (value: unknown): StickerBlockProps =>
  normalizeProps(parseInlineObjectPayload<{props?: Partial<StickerBlockProps>}>(value)?.props)

export function createInlineStickerDelta(
  props: Partial<StickerBlockProps>,
  dimensions?: {width: number; height: number},
  wrap?: Partial<InlineObjectWrapOptions>,
): DeltaInsertEmbed {
  const normalized = normalizeProps(props)
  const fixedSize = resolveStickerDimensions({...normalized, ...props})
  const width = Number.isFinite(dimensions?.width) && dimensions!.width > 0
    ? dimensions!.width : fixedSize.width
  const height = Number.isFinite(dimensions?.height) && dimensions!.height > 0
    ? dimensions!.height : fixedSize.height
  const size = resolveStickerDimensions({width, height})
  const {side: _side, ...attributes} = createInlineObjectAttributes(size.width, size.height, wrap)
  const payload = {
    presetId: normalized.presetId,
    presetVersion: normalized.presetVersion,
    ...(normalized.colors ? {colors: normalized.colors} : {}),
    ...(normalized.rotation ? {rotation: normalized.rotation} : {}),
  }
  return {
    insert: {[INLINE_STICKER_EMBED_KEY]: serializeInlineObjectPayload({props: payload})},
    attributes,
  }
}

export function readInlineStickerDelta(delta: DeltaInsertEmbed): InlineStickerData {
  const props = readProps(delta.insert[INLINE_STICKER_EMBED_KEY])
  const preset = getStickerPreset(props.presetId, props.presetVersion)
  const {side: _side, ...layout} = readInlineObjectLayout(
    delta, preset?.width ?? 160, preset?.height ?? 160,
  )
  const size = resolveStickerDimensions(layout)
  return {...layout, ...size, props: {...props, ...size}}
}

const findShell = (element: HTMLElement): HTMLElement =>
  element.matches('.bc-inline-object-shell[data-bc-inline-object="sticker"]')
    ? element
    : element.closest<HTMLElement>('.bc-inline-object-shell[data-bc-inline-object="sticker"]')
      ?? element.querySelector<HTMLElement>('.bc-inline-object-shell[data-bc-inline-object="sticker"]')
      ?? element

export const createInlineStickerEmbedConverter = (): EmbedConverter => ({
  toView: delta => {
    const data = readInlineStickerDelta(delta)
    const {shell, frame} = createInlineObjectShell('sticker', data)
    shell.classList.add('bc-inline-sticker-shell')
    frame.classList.add('bc-inline-sticker-frame')
    frame.dataset['bcInlineObjectPayload'] = String(delta.insert[INLINE_STICKER_EMBED_KEY] ?? '')
    frame.style.position = 'relative'
    if (data.props.rotation) frame.style.transform = `rotate(${data.props.rotation}deg)`
    const image = document.createElement('img')
    image.src = renderStickerDataUrl(data.props.presetId, data.props.presetVersion, data.props.colors) ?? ''
    image.alt = '贴纸'
    image.draggable = false
    image.setAttribute('contenteditable', 'false')
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.display = 'block'
    frame.append(image)
    return shell
  },
  toDelta: element => {
    const shell = findShell(element)
    const frame = shell.querySelector<HTMLElement>('.bc-inline-sticker-frame')
    const props = readProps(frame?.dataset['bcInlineObjectPayload'])
    const width = Number.parseFloat(frame?.style.width ?? '')
    const height = Number.parseFloat(frame?.style.height ?? '')
    return createInlineStickerDelta(props, {width, height}, readInlineObjectWrapFromShell(shell))
  },
})

export const inlineStickerEmbedConverter = createInlineStickerEmbedConverter()
