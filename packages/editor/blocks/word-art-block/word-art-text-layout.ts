import {
  objectTextTransformCss,
  type ObjectTextDirection,
  type ObjectTextTransform,
  type ObjectTextVerticalAlign,
} from '../../framework/block-std/block/object-format'

// Package-internal projection, shared by the editor, viewer, embed and HTML.
// Keep direction outside the effect's local coordinates and object rotation
// outside both. No layout reads or persistent geometry changes are needed.
export function wordArtTextLayout(props: {
  width: number
  height: number
  effect: ObjectTextTransform
  textFrame: {direction: ObjectTextDirection; verticalAlign: ObjectTextVerticalAlign}
}) {
  const {width, height, textFrame: {direction}} = props
  const vertical = direction === 'vertical-rl'
  const angle = direction === 'rotate-90' ? 90 : direction === 'rotate-270' ? 270 : 0
  const rotated = angle !== 0
  const transform = rotated ? `translate(-50%, -50%) rotate(${angle}deg)` : ''
  const effect = objectTextTransformCss(props.effect)
  const textStyle = {
    writingMode: vertical ? 'vertical-rl' : '',
    position: rotated ? 'absolute' : '',
    left: rotated ? '50%' : '',
    top: rotated ? '50%' : '',
    width: rotated ? `${height}px` : vertical ? 'auto' : '',
    height: rotated ? 'auto' : vertical ? '100%' : '',
    maxHeight: rotated ? `${width}px` : '',
    transform: [transform, effect].filter(Boolean).join(' '),
  }
  const projectionStyle = {
    // Override the theme's inset:0 when centering the rotated text space.
    inset: rotated ? 'auto' : '',
    left: rotated ? '50%' : '',
    top: rotated ? '50%' : '',
    width: rotated ? `${height}px` : '',
    height: rotated ? `${width}px` : '',
    transform,
    transformOrigin: rotated ? 'center center' : '',
  }
  return {
    textStyle,
    projectionStyle,
    justifyContent: vertical
      ? props.textFrame.verticalAlign === 'top' ? 'flex-end'
        : props.textFrame.verticalAlign === 'bottom' ? 'flex-start' : 'center'
      : '',
    // Serialization is only needed by HTML export, not each editor render.
    get textCss() { return cssText(textStyle) },
    get projectionCss() { return cssText(projectionStyle) },
    viewBox: `0 0 ${rotated ? height : width} ${rotated ? width : height}`,
    pathWidth: rotated || vertical ? height : width,
    pathHeight: rotated || vertical ? width : height,
    // Rotate the baseline, not the glyphs: SVG writing-mode handles mixed
    // CJK/Latin orientation along the resulting vertical curve.
    pathTransform: vertical ? `matrix(0 1 -1 0 ${width} 0)` : null,
  }
}

function cssText(style: Record<string, string>): string {
  return Object.entries(style).filter(([, value]) => value).map(([key, value]) =>
    `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${value}`,
  ).join(';')
}
