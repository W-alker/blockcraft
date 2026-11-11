import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const MATERIAL_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'materialToolbar', label: '物料工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
  },
})
