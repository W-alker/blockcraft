import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const DIVIDER_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'dividerToolbar', label: '分割线工具栏', fields: {
    enabled: {
      type: 'boolean', label: '显示分割线工具栏', default: true,
      presets: {immersive: false}, experiences: {light: false},
    },
  },
})
