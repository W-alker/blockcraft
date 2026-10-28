import type {BlockObjectFormatCapability} from './object-format'
import {MIN_FORMATTED_OBJECT_SIZE, MAX_FORMATTED_OBJECT_SIZE} from './geometry-limits'

/** Package-internal derived size. Authored width/height remain undoable inputs. */
export function resolveTextFit(
  props: Readonly<Record<string, unknown>> | null | undefined,
  capability: Readonly<BlockObjectFormatCapability>,
): {axis: 'width' | 'height'; size: number} | null {
  if (props?.['textAutoFit'] !== 'resize-shape' ||
    typeof props['textFit'] !== 'number' || !Number.isFinite(props['textFit']) || props['textFit'] <= 0) return null
  const direction = typeof props['textDirection'] === 'string' ? props['textDirection'] : capability.defaults.textFrame?.direction ?? 'horizontal'
  const transform = typeof props['textTransform'] === 'string' ? props['textTransform'] : capability.defaults.textStyle?.transform ?? 'none'
  const textBox = capability.kind === 'text-box'
  if (textBox ? !['horizontal', 'vertical-rl'].includes(direction)
    : capability.kind !== 'word-art' || direction !== 'horizontal' ||
      ['arch-up', 'arch-down', 'circle', 'wave'].includes(transform)) return null
  const axis = direction === 'vertical-rl' ? 'width' : 'height'
  return {axis, size: Math.min(MAX_FORMATTED_OBJECT_SIZE,
    Math.max(MIN_FORMATTED_OBJECT_SIZE, Math.ceil(props['textFit'])))}
}
