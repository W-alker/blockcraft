import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

/** 由 TableBlockBinding 注册，表格组件负责消费；未安装插件时保留原有显示行为。 */
export const TABLE_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'tableToolbar', label: '表格结构工具栏', fields: {
    enabled: {type: 'boolean', label: '显示表格浮动工具栏', default: true, presets: {immersive: false}},
    textFocus: {type: 'boolean', label: '编辑单元格文字时显示', default: true},
  },
})
