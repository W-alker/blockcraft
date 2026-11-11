import type {EditorInteractionMode} from './interaction-schema'

/** Stable IDs for host persistence; labels and presentation may be customized by hosts. */
export type EditorExperience = 'focus' | 'light' | 'mixed' | 'layout' | 'design'
export interface EditorExperienceDefinition {
  readonly id: EditorExperience
  readonly preset: EditorInteractionMode
  readonly label: string
  readonly shortLabel: string
  readonly description: string
}

/** Official experience order. Capability differences belong to native/plugin declarations. */
export const EDITOR_EXPERIENCES: readonly EditorExperienceDefinition[] = Object.freeze([
  {id: 'focus', preset: 'immersive', label: '专注内容', shortLabel: '专注', description: '收起布局控件，让思路留在文字里。'},
  {id: 'light', preset: 'mixed', label: '轻量编辑', shortLabel: '轻编', description: '文字选区稍停后显示工具，正文块菜单点击展开。'},
  {id: 'mixed', preset: 'mixed', label: '图文混排', shortLabel: '混排', description: '安心写内容，需要时再移动、调整图文。'},
  {id: 'layout', preset: 'design', label: '布局调整', shortLabel: '布局', description: '聚焦对象即显示工具栏与抓手，悬停保持安静。'},
  {id: 'design', preset: 'design', label: '精细设计', shortLabel: '设计', description: '悬停即可发现操作入口，精细调整每个对象。'},
].map(item => Object.freeze(item)) as EditorExperienceDefinition[])
