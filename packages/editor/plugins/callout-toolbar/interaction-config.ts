import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const REGION_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'regionToolbar', label: '内容区域工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
    contentSelection: {type: 'boolean', label: '内容区域内部选区工具栏', default: false, presets: {design: true}},
  },
})
