import {EDITOR_EXPERIENCES, type EditorExperience} from './editing-experience'
import {assertInteractionKey, defineInteractionConfig, freezeInteractionValue, isInteractionRecord, validateInteractionValue,
  type EditorInteractionMode, type InteractionConfigDefinition, type InteractionValue} from './interaction-schema'
export type {EditorInteractionMode} from './interaction-schema'

/** Native capabilities belong to Document; plugin declarations never extend this namespace. */
export interface EditorNativeInteractionPolicy {
  readonly layoutControls: boolean
  readonly objectFloatingHandles: boolean
  readonly hoverControls: boolean
  readonly contentResizeHandles: boolean
  readonly moveExistingBlocks: boolean
  readonly groupOutline: boolean
}
export interface EditorInteractionPolicy {
  readonly native: EditorNativeInteractionPolicy
  readonly plugins: Readonly<Record<string, Readonly<Record<string, InteractionValue>>>>
}
export interface EditorInteractionOverrides {
  readonly native?: Partial<EditorNativeInteractionPolicy>
  readonly plugins?: Readonly<Record<string, Readonly<Record<string, InteractionValue>>>>
}
export interface EditorInteractionConfig {
  readonly experience?: EditorExperience
  readonly preset?: EditorInteractionMode
  readonly overrides?: EditorInteractionOverrides
}
export interface EditorInteractionSnapshot {
  readonly experience?: EditorExperience
  readonly preset: EditorInteractionMode
  readonly overrides: EditorInteractionOverrides
  readonly policy: EditorInteractionPolicy
}

export const NATIVE_INTERACTION_CONFIG = defineInteractionConfig({
  namespace: 'native', label: '原生交互', fields: {
    layoutControls: {type: 'boolean', label: '布局控件', default: true, presets: {immersive: false}},
    objectFloatingHandles: {type: 'boolean', label: '对象浮动抓手按钮', default: true, experiences: {light: false}},
    hoverControls: {type: 'boolean', label: '悬停边框与抓手', default: false, presets: {immersive: true, design: true}, experiences: {layout: false}},
    contentResizeHandles: {type: 'boolean', label: '文字聚焦时显示缩放抓手', default: false, presets: {design: true}},
    moveExistingBlocks: {type: 'boolean', label: '拖动与键盘移动已有块', default: true, presets: {immersive: false}, experiences: {light: false}},
    groupOutline: {type: 'boolean', label: '组合选中与内部聚焦边框', default: true, presets: {immersive: false}, experiences: {light: false}},
  },
})

function valuesFor(definition: InteractionConfigDefinition, mode: EditorInteractionMode, experience?: EditorExperience): Record<string, InteractionValue> {
  return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => [key, (experience ? field.experiences?.[experience] : undefined) ?? field.presets?.[mode] ?? field.default]))
}
function copyFields(value: unknown, definition: InteractionConfigDefinition): Record<string, InteractionValue> {
  if (!isInteractionRecord(value)) throw new TypeError(`Invalid interaction overrides: ${definition.namespace}`)
  const copy: Record<string, InteractionValue> = {}
  for (const [key, child] of Object.entries(value)) {
    if (!Object.hasOwn(definition.fields, key) || !validateInteractionValue(definition.fields[key]!, child)) {
      throw new TypeError(`Invalid interaction option: ${definition.namespace}.${key}`)
    }
    copy[key] = child
  }
  return copy
}

/** Immutable, per-document catalog. Resolving overrides never revalidates declarations. */
export class EditorInteractionRegistry {
  readonly definitions: readonly InteractionConfigDefinition[]
  readonly presets: Readonly<Record<EditorInteractionMode, EditorInteractionPolicy>>
  readonly experiences: Readonly<Record<EditorExperience, EditorInteractionPolicy>>
  private readonly plugins = new Map<string, InteractionConfigDefinition>()

  constructor(definitions: readonly InteractionConfigDefinition[] = []) {
    for (const source of definitions) {
      assertInteractionKey(source.namespace)
      if (source.namespace === 'native' || this.plugins.has(source.namespace)) {
        throw new TypeError(`Duplicate or reserved interaction namespace: ${source.namespace}`)
      }
      this.plugins.set(source.namespace, defineInteractionConfig(source))
    }
    this.definitions = Object.freeze([NATIVE_INTERACTION_CONFIG, ...this.plugins.values()])
    const preset = (mode: EditorInteractionMode, experience?: EditorExperience): EditorInteractionPolicy => freezeInteractionValue({
      native: valuesFor(NATIVE_INTERACTION_CONFIG, mode, experience) as unknown as EditorNativeInteractionPolicy,
      plugins: Object.fromEntries([...this.plugins].map(([key, definition]) => [key, valuesFor(definition, mode, experience)])),
    })
    this.presets = Object.freeze({mixed: preset('mixed'), immersive: preset('immersive'), design: preset('design')})
    this.experiences = Object.freeze(Object.fromEntries(EDITOR_EXPERIENCES.map(item =>
      [item.id, preset(item.preset, item.id)]))) as Readonly<Record<EditorExperience, EditorInteractionPolicy>>
  }

  resolve(config: EditorInteractionConfig = {}): EditorInteractionSnapshot {
    const experience = config.experience
    const definition = experience === undefined ? undefined : EDITOR_EXPERIENCES.find(item => item.id === experience)
    if (experience !== undefined && !definition) throw new TypeError(`Unknown editing experience: ${experience}`)
    if (definition && config.preset !== undefined && config.preset !== definition.preset) {
      throw new TypeError('Experience and preset conflict')
    }
    const mode = definition?.preset ?? config.preset ?? 'mixed'
    if (!Object.hasOwn(this.presets, mode)) throw new TypeError(`Unknown interaction preset: ${mode}`)
    const source = config.overrides ?? {}
    if (!isInteractionRecord(source) || Object.keys(source).some(key => key !== 'native' && key !== 'plugins')) {
      throw new TypeError('Invalid interaction overrides')
    }
    const native = source['native'] === undefined ? {} : copyFields(source['native'], NATIVE_INTERACTION_CONFIG)
    const pluginOverrides: Record<string, Record<string, InteractionValue>> = {}
    if (source['plugins'] !== undefined) {
      if (!isInteractionRecord(source['plugins'])) throw new TypeError('Invalid interaction plugins')
      for (const [key, value] of Object.entries(source['plugins'])) {
        const definition = this.plugins.get(key)
        if (!definition) throw new TypeError(`Unregistered interaction namespace: ${key}`)
        const fields = copyFields(value, definition)
        if (Object.keys(fields).length) pluginOverrides[key] = fields
      }
    }
    const base = experience === undefined ? this.presets[mode] : this.experiences[experience]
    return freezeInteractionValue({preset: mode, ...(experience === undefined ? {} : {experience}),
      overrides: {...(Object.keys(native).length ? {native} : {}),
        ...(Object.keys(pluginOverrides).length ? {plugins: pluginOverrides} : {})},
      policy: {native: {...base.native, ...native},
        plugins: Object.fromEntries([...this.plugins.keys()].map(key => [key, {...base.plugins[key], ...pluginOverrides[key]}]))},
    }) as EditorInteractionSnapshot
  }
}

/** Native-only presets. Installed plugins contribute defaults to each document's registry. */
export const EDITOR_INTERACTION_PRESETS = new EditorInteractionRegistry().presets
export function resolveEditorInteraction(config: EditorInteractionConfig = {}, definitions: readonly InteractionConfigDefinition[] = []): EditorInteractionSnapshot {
  return new EditorInteractionRegistry(definitions).resolve(config)
}
