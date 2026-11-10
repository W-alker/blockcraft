import type {BlockCraftDoc, EditorInteractionConfig, EditorInteractionPolicy} from '@ccc/blockcraft'

/** Product-level combinations. Core modes and plugin declarations remain unchanged. */
export const EDITING_EXPERIENCES: ReadonlyArray<{
  label: string; shortLabel: string; description: string; config: EditorInteractionConfig;
}> = [
  {label: '专注内容', shortLabel: '专注', description: '收起布局控件，让思路留在文字里。', config: {preset: 'immersive'}},
  {label: '轻量编辑', shortLabel: '轻编', description: '保留文字与对象编辑，收起对象抓手按钮和组合操作。',
    config: {preset: 'mixed', overrides: {native: {moveExistingBlocks: false, groupOutline: false, objectFloatingHandles: false}, plugins: {groupToolbar: {enabled: false}}}}},
  {label: '图文混排', shortLabel: '混排', description: '安心写内容，需要时再移动、调整图文。', config: {preset: 'mixed'}},
  {label: '布局调整', shortLabel: '布局', description: '聚焦对象即显示工具栏与抓手，悬停保持安静。',
    config: {preset: 'design', overrides: {native: {hoverControls: false}}}},
  {label: '精细设计', shortLabel: '设计', description: '悬停即可发现操作入口，精细调整每个对象。', config: {preset: 'design'}},
]

export function experienceConfig(doc: BlockCraftDoc, index: number): EditorInteractionConfig {
  const config = EDITING_EXPERIENCES[index]!.config
  // A product profile can mention an optional plugin without installing it.
  const plugins = Object.fromEntries(Object.entries(config.overrides?.plugins ?? {})
    .filter(([namespace]) => Object.hasOwn(doc.interaction.policy.plugins, namespace)))
  return {preset: config.preset, overrides: {...config.overrides, plugins}}
}

export function matchingExperience(doc: BlockCraftDoc): number {
  const actual = JSON.stringify(doc.interaction.policy)
  return EDITING_EXPERIENCES.findIndex((_, index) => {
    const config = experienceConfig(doc, index)
    const base = doc.interaction.presets[config.preset!]
    const expected: EditorInteractionPolicy = {native: {...base.native, ...config.overrides?.native},
      plugins: Object.fromEntries(Object.entries(base.plugins).map(([namespace, fields]) =>
        [namespace, {...fields, ...config.overrides?.plugins?.[namespace]}]))}
    return JSON.stringify(expected) === actual
  })
}
