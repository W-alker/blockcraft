import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const TEXT_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'textToolbar', label: '文字浮动工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
    openDelay: {type: 'number', label: '选区停留后显示（毫秒）', default: 350, min: 0, max: 2000, integer: true, experiences: {light: 650}},
  },
})

export const TEXT_MARKER_INTERACTION = defineInteractionConfig({
  namespace: 'textMarker', label: '代码文字标记工具栏', fields: {
    enabled: {type: 'boolean', label: '显示浮动工具栏', default: true, presets: {immersive: false}},
  },
})
