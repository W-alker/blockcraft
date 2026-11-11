import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const IMAGE_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'imageToolbar', label: '图片工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
    contentSelection: {type: 'boolean', label: '图片说明选区工具栏', default: false, presets: {design: true}},
  },
})
