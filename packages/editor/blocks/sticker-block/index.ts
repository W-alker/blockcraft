import {
  BlockNodeType,
  type IBlockProps,
  type IBlockSchemaOptions,
  type NoEditableBlockNative,
  generateId,
} from '../../framework'
import {StickerBlockComponent} from './sticker.block'
import {STICKER_PRESETS, getStickerPreset, normalizeStickerColors} from './presets'

export * from './presets'
export {StickerBlockComponent} from './sticker.block'

export interface StickerBlockProps extends IBlockProps {
  presetId: string
  presetVersion: number
  colors?: Record<string, string>
  rotation?: number
  width?: number | null
  height?: number | null
}

export interface StickerBlockModel extends NoEditableBlockNative {
  flavour: 'sticker'
  nodeType: BlockNodeType.void
  props: StickerBlockProps
}

export function createStickerProps(
  presetId: string = STICKER_PRESETS[0].id,
  presetVersion = 1,
  colors?: unknown,
): StickerBlockProps {
  const preset = getStickerPreset(presetId, presetVersion)
  const overrides = preset ? normalizeStickerColors(preset, colors) : {}
  return {
    presetId,
    presetVersion,
    width: preset?.width ?? 160,
    height: preset?.height ?? 160,
    ...(Object.keys(overrides).length ? {colors: overrides} : {}),
  }
}

export const StickerBlockSchema: IBlockSchemaOptions<StickerBlockModel> = {
  flavour: 'sticker',
  nodeType: BlockNodeType.void,
  component: StickerBlockComponent,
  createSnapshot: (presetId?: string, colors?: unknown, presetVersion = 1) => ({
    id: generateId(),
    flavour: 'sticker',
    nodeType: BlockNodeType.void,
    props: createStickerProps(presetId, presetVersion, colors),
    meta: {},
    children: [],
  }),
  metadata: {
    version: 1,
    label: '贴纸',
    description: '从内置图形中选择贴纸，并分别调整颜色',
    icon: 'bc_icon bc_tiezhi',
    objectDrag: 'body',
    placement: {modes: ['relative', 'absolute']},
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      sticker: StickerBlockComponent
    }

    interface IBlockCreateParameters {
      sticker: [string?, unknown?, number?]
    }
  }
}
