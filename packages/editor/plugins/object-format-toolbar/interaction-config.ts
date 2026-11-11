import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const OBJECT_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'objectToolbar', label: '对象格式工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
    contentSelection: {type: 'boolean', label: '对象内部选区工具栏', default: false, presets: {design: true}},
  },
})

export const GROUP_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'groupToolbar', label: '组合工具栏', fields: {
    enabled: {type: 'boolean', label: '整组选中工具栏', default: true, presets: {immersive: false}, experiences: {light: false}},
  },
})
