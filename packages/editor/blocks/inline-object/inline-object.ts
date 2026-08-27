import type {
  DeltaInsert,
  DeltaInsertEmbed,
  IInlineNodeAttrs,
} from '../../framework'
import {
  DEFAULT_INLINE_IMAGE_WRAP_GAP,
  normalizeInlineImageWrapOptions,
  type InlineImageWrapOptions,
  type InlineImageWrapSide,
} from '../../embeds/image'

export const INLINE_OBJECT_FRAME_ATTRIBUTE = 'data-bc-inline-float-frame'

export type InlineObjectKind = 'shape' | 'word-art'
export type InlineObjectWrapSide = InlineImageWrapSide
export type InlineObjectWrapOptions = InlineImageWrapOptions

export interface InlineObjectLayoutData extends InlineObjectWrapOptions {
  width: number
  height: number
}

const finiteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

const nonNegativeNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

export function cloneInlineObjectDeltas(
  deltas: readonly DeltaInsert[],
): DeltaInsert[] {
  return deltas.map(delta => ({
    ...delta,
    ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
    ...(typeof delta.insert === 'object' && delta.insert
      ? {insert: {...delta.insert}}
      : {}),
  }))
}

export function inlineObjectPlainText(
  deltas: readonly DeltaInsert[],
): string {
  return deltas.map(delta => {
    if (typeof delta.insert === 'string') return delta.insert
    return delta.insert?.['break'] ? '\n' : '\uFFFC'
  }).join('')
}

export function parseInlineObjectPayload<T>(
  value: unknown,
): T | null {
  if (typeof value !== 'string' || value.length > 1_000_000) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as T : null
  } catch {
    return null
  }
}

export function serializeInlineObjectPayload(value: object): string {
  return JSON.stringify(value)
}

export function readInlineObjectLayout(
  delta: DeltaInsertEmbed,
  fallbackWidth: number,
  fallbackHeight: number,
): InlineObjectLayoutData {
  const width = positiveNumber(delta.attributes?.['width']) ?? fallbackWidth
  const height = positiveNumber(delta.attributes?.['height']) ?? fallbackHeight
  const wrap = normalizeInlineImageWrapOptions({
    wrap: delta.attributes?.['wrap'] === true ? true : undefined,
    side: delta.attributes?.['side'] as InlineImageWrapSide | undefined,
    x: finiteNumber(delta.attributes?.['x']),
    gap: nonNegativeNumber(delta.attributes?.['gap']),
  })
  return {width, height, ...wrap}
}

export function createInlineObjectAttributes(
  width: number,
  height: number,
  wrap?: Partial<InlineObjectWrapOptions>,
): IInlineNodeAttrs {
  return {
    width,
    height,
    ...normalizeInlineImageWrapOptions(wrap),
  }
}

export function createInlineObjectShell(
  kind: InlineObjectKind,
  layout: InlineObjectLayoutData,
): {shell: HTMLSpanElement; frame: HTMLSpanElement} {
  const shell = document.createElement('span')
  const frame = document.createElement('span')
  shell.classList.add('bc-inline-object-shell')
  shell.dataset['bcInlineObject'] = kind
  frame.classList.add('bc-inline-object-frame')
  frame.setAttribute(INLINE_OBJECT_FRAME_ATTRIBUTE, '')
  frame.style.width = `${layout.width}px`
  frame.style.height = `${layout.height}px`
  frame.style.aspectRatio = `${layout.width} / ${layout.height}`

  if (layout.wrap) {
    shell.dataset['bcInlineFloat'] = 'true'
    shell.dataset['bcInlineFloatLayout'] = 'wrap'
    shell.dataset['bcInlineFloatSide'] = layout.side ?? 'auto'
    shell.dataset['bcInlineFloatX'] = String(layout.x ?? 0)
    shell.dataset['bcInlineFloatWidth'] = String(layout.width)
    shell.dataset['bcInlineFloatHeight'] = String(layout.height)
    if (layout.gap !== undefined) {
      shell.dataset['bcInlineFloatGap'] = String(layout.gap)
    }
  } else {
    shell.style.width = `${layout.width}px`
    shell.style.height = `${layout.height}px`
    shell.style.aspectRatio = `${layout.width} / ${layout.height}`
  }
  shell.appendChild(frame)
  return {shell, frame}
}

export function readInlineObjectWrapFromShell(
  shell: HTMLElement | null | undefined,
): InlineObjectWrapOptions {
  if (shell?.dataset['bcInlineFloatLayout'] !== 'wrap') return {}
  const x = finiteNumber(shell.dataset['bcInlineFloatX'])
  const gap = nonNegativeNumber(shell.dataset['bcInlineFloatGap'])
  return normalizeInlineImageWrapOptions({
    wrap: true,
    side: shell.dataset['bcInlineFloatSide'] as
      InlineImageWrapSide | undefined,
    x,
    gap,
  })
}

export function defaultInlineObjectWrap(
  x = 0,
): Required<Pick<InlineObjectWrapOptions, 'wrap' | 'side' | 'x' | 'gap'>> {
  return {
    wrap: true,
    side: 'auto',
    x: Math.min(1, Math.max(0, x)),
    gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
  }
}
