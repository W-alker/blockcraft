import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const STICKER_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'stickerToolbar', label: '贴纸工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
  },
})
