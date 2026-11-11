import {defineInteractionConfig} from '../../framework/doc/interaction-schema'

export const BLOCK_CONTROLLER_INTERACTION = defineInteractionConfig({
  namespace: 'blockController', label: '正文块操作', fields: {
    enabled: {type: 'boolean', label: '显示块操作入口', default: true, presets: {immersive: false}},
    hoverMenu: {type: 'boolean', label: '悬停自动展开菜单', default: true, experiences: {light: false}},
  },
})
