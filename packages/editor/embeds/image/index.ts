import type {EmbedConverter} from '../../framework/block-std/inline'
import type {DeltaInsertEmbed} from '../../framework/block-std/types'
import {
  imageResourcePlaceholderAdapter,
  ResourcePlaceholderController,
} from '@ccc/blockcraft/global/resource-placeholder'
import {INLINE_IMAGE_INTRINSIC_SIZE_EVENT} from './events'

import {
  INLINE_IMAGE_EMBED_KEY, DEFAULT_INLINE_IMAGE_WIDTH, DEFAULT_INLINE_IMAGE_HEIGHT,
  readInlineImageDelta, createInlineImageDelta,
  type InlineImageWrapSide,
} from '../../framework/block-std/inline/image-data'
import {finiteNumber, nonNegativeNumber} from '../../framework/block-std/inline/image-numbers'
export {
  INLINE_IMAGE_EMBED_KEY, DEFAULT_INLINE_IMAGE_WIDTH, DEFAULT_INLINE_IMAGE_HEIGHT,
  DEFAULT_INLINE_IMAGE_WRAP_GAP, normalizeInlineImageWrapOptions,
  createInlineImageDelta, readInlineImageDelta,
} from '../../framework/block-std/inline/image-data'
export type {InlineImageWrapSide, InlineImageWrapOptions, InlineImageData} from '../../framework/block-std/inline/image-data'

const INLINE_IMAGE_SHELL_CLASS = 'bc-inline-image-shell'
const INLINE_IMAGE_FRAME_CLASS = 'bc-inline-image-frame'
const INLINE_IMAGE_CLASS = 'bc-inline-image'
const inlineImageControllers =
  new WeakMap<HTMLElement, ResourcePlaceholderController>()
const inlineImageNativeDragGuards = new WeakMap<HTMLElement, EventListener>()

export const inlineImageEmbedConverter: EmbedConverter = {
  toView: delta => {
    const data = readInlineImageDelta(delta)
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    const image = document.createElement('img')
    const width = data.width ?? DEFAULT_INLINE_IMAGE_WIDTH
    const height = data.height ??
      (data.width == null
        ? DEFAULT_INLINE_IMAGE_HEIGHT
        : data.width * DEFAULT_INLINE_IMAGE_HEIGHT / DEFAULT_INLINE_IMAGE_WIDTH)
    shell.classList.add(INLINE_IMAGE_SHELL_CLASS)
    shell.dataset['bcInlineImage'] = 'true'
    frame.classList.add(INLINE_IMAGE_FRAME_CLASS)
    frame.setAttribute('data-bc-inline-float-frame', '')
    frame.style.width = `${width}px`
    frame.style.aspectRatio = `${width} / ${height}`
    if (data.wrap) {
      shell.dataset['bcInlineFloat'] = 'true'
      shell.dataset['bcInlineImageLayout'] = 'wrap'
      shell.dataset['bcInlineImageWrapSide'] = data.side ?? 'auto'
      shell.dataset['bcInlineImageWrapX'] = String(data.x ?? 0)
      if (data.gap !== undefined) {
        shell.dataset['bcInlineImageWrapGap'] = String(data.gap)
      }
      shell.dataset['bcInlineImageWidth'] = String(width)
      shell.dataset['bcInlineImageHeight'] = String(height)
    } else {
      shell.style.width = `${width}px`
      shell.style.aspectRatio = `${width} / ${height}`
    }
    image.classList.add(INLINE_IMAGE_CLASS)
    image.alt = ''
    // Pointer drag is the only model-owned positioning path. Native image DnD
    // can otherwise emit deleteByDrag/insertFromDrop inside contenteditable.
    image.draggable = false
    if (data.src) image.setAttribute('src', data.src)
    if (data.width !== undefined) image.setAttribute('width', String(data.width))
    if (data.height !== undefined) image.setAttribute('height', String(data.height))
    frame.appendChild(image)
    shell.appendChild(frame)
    const controller = new ResourcePlaceholderController(frame, {
      onIntrinsicSize: size => {
        if (data.width != null && data.height != null) return
        shell.dispatchEvent(new CustomEvent(INLINE_IMAGE_INTRINSIC_SIZE_EVENT, {
          bubbles: true,
          composed: true,
          detail: {
            src: data.src,
            width: size.width,
            height: size.height,
          },
        }))
      },
    })
    controller.bind({
      element: image,
      adapter: imageResourcePlaceholderAdapter,
      resourceKey: data.src,
    })
    const preventNativeDrag: EventListener = event => {
      event.preventDefault()
      event.stopPropagation()
    }
    shell.addEventListener('dragstart', preventNativeDrag, true)
    inlineImageNativeDragGuards.set(shell, preventNativeDrag)
    inlineImageControllers.set(shell, controller)
    return shell
  },
  toDelta: element => {
    const shell = element.matches(`.${INLINE_IMAGE_SHELL_CLASS}`)
      ? element
      : element.closest<HTMLElement>(`.${INLINE_IMAGE_SHELL_CLASS}`) ??
        element.querySelector<HTMLElement>(`.${INLINE_IMAGE_SHELL_CLASS}`)
    const image = element instanceof HTMLImageElement
      ? element
      : element.querySelector<HTMLImageElement>(`img.${INLINE_IMAGE_CLASS}`)
    return createInlineImageDelta(
      image?.getAttribute('src') || '',
      image?.getAttribute('width'),
      image?.getAttribute('height'),
      shell?.dataset['bcInlineImageLayout'] === 'wrap'
        ? {
            wrap: true,
            side: shell.dataset['bcInlineImageWrapSide'] as
              InlineImageWrapSide | undefined,
            x: finiteNumber(shell.dataset['bcInlineImageWrapX']),
            gap: nonNegativeNumber(shell.dataset['bcInlineImageWrapGap']),
          }
        : undefined,
    ) ?? {insert: {[INLINE_IMAGE_EMBED_KEY]: ''}}
  },
  onDestroy: element => {
    const preventNativeDrag = inlineImageNativeDragGuards.get(element)
    if (preventNativeDrag) {
      element.removeEventListener('dragstart', preventNativeDrag, true)
      inlineImageNativeDragGuards.delete(element)
    }
    inlineImageControllers.get(element)?.destroy()
    inlineImageControllers.delete(element)
  },
}
