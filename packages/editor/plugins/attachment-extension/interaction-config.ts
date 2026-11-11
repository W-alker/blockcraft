import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const ATTACHMENT_TOOLBAR_INTERACTION = defineInteractionConfig({
  namespace: 'attachmentToolbar', label: '附件工具栏', fields: {
    selectionOpen: {type: 'boolean', label: '选中时显示附件工具栏', default: true, presets: {immersive: false}},
    hoverOpen: {type: 'boolean', label: '悬停显示附件工具栏', default: true},
  },
})
