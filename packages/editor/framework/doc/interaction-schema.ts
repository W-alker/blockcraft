import {EDITOR_EXPERIENCES, type EditorExperience} from './editing-experience'

export type EditorInteractionMode = 'mixed' | 'immersive' | 'design'
export type InteractionValue = boolean | number | string

type FieldBase<T extends InteractionValue> = {
  readonly label: string
  readonly default: T
  readonly presets?: Partial<Readonly<Record<EditorInteractionMode, T>>>
  readonly experiences?: Partial<Readonly<Record<EditorExperience, T>>>
}
export type InteractionField =
  | (FieldBase<boolean> & {readonly type: 'boolean'})
  | (FieldBase<number> & {readonly type: 'number'; readonly min?: number; readonly max?: number; readonly integer?: boolean})
  | (FieldBase<string> & {readonly type: 'text'; readonly maxLength?: number})
  | (FieldBase<string> & {readonly type: 'select'; readonly options: readonly {readonly value: string; readonly label: string}[]})

export interface InteractionConfigDefinition<F extends Readonly<Record<string, InteractionField>> = Readonly<Record<string, InteractionField>>> {
  readonly namespace: string
  readonly label: string
  readonly fields: F
}
export type InteractionConfigValues<F extends Readonly<Record<string, InteractionField>>> = {
  readonly [K in keyof F]: F[K] extends {type: 'boolean'} ? boolean : F[K] extends {type: 'number'} ? number : string
}

export function freezeInteractionValue<T extends object>(value: T): T {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freezeInteractionValue(child) })
  return Object.freeze(value)
}

export function isInteractionRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

export function assertInteractionKey(key: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) {
    throw new TypeError(`Invalid interaction key: ${key}`)
  }
}

export function validateInteractionValue(field: InteractionField, value: unknown): value is InteractionValue {
  switch (field.type) {
    case 'boolean': return typeof value === 'boolean'
    case 'number': return typeof value === 'number' && Number.isFinite(value) &&
      (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max) &&
      (!field.integer || Number.isInteger(value))
    case 'text': return typeof value === 'string' && (field.maxLength === undefined || value.length <= field.maxLength)
    case 'select': return typeof value === 'string' && field.options.some(option => option.value === value)
  }
}

/** Declaration factory: validates, copies and freezes metadata without registering global state. */
export function defineInteractionConfig<const F extends Readonly<Record<string, InteractionField>>>(
  definition: InteractionConfigDefinition<F>,
): InteractionConfigDefinition<F> {
  assertInteractionKey(definition.namespace)
  if (typeof definition.label !== 'string' || !definition.label || !isInteractionRecord(definition.fields) || !Object.keys(definition.fields).length) {
    throw new TypeError(`Invalid interaction definition: ${definition.namespace}`)
  }
  const fields: Record<string, InteractionField> = {}
  for (const [key, source] of Object.entries(definition.fields)) {
    assertInteractionKey(key)
    if (!isInteractionRecord(source) || typeof source.label !== 'string' || !source.label) throw new TypeError(`Invalid interaction field: ${key}`)
    const keys = ['type', 'label', 'default', 'presets', 'experiences', ...(source.type === 'number' ? ['min', 'max', 'integer']
      : source.type === 'text' ? ['maxLength'] : source.type === 'select' ? ['options'] : [])]
    if (Object.keys(source).some(name => !keys.includes(name))) throw new TypeError(`Unknown interaction field constraint: ${key}`)
    if (source.presets !== undefined && !isInteractionRecord(source.presets)) throw new TypeError(`Invalid interaction presets: ${key}`)
    if (source.type === 'number' && source.integer !== undefined && typeof source.integer !== 'boolean') throw new TypeError(`Invalid integer constraint: ${key}`)
    if (source.experiences !== undefined && !isInteractionRecord(source.experiences)) throw new TypeError(`Invalid interaction experiences: ${key}`)
    const field = {...source, ...(source.presets ? {presets: {...source.presets}} : {}),
      ...(source.experiences ? {experiences: {...source.experiences}} : {})} as InteractionField
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || !field.options.length || field.options.some(option =>
        !option || typeof option.value !== 'string' || typeof option.label !== 'string') ||
        new Set(field.options.map(option => option.value)).size !== field.options.length) {
        throw new TypeError(`Invalid interaction choices: ${key}`)
      }
      fields[key] = {...field, options: field.options.map(option => ({value: option.value, label: option.label}))}
    } else {
      if (field.type === 'number' && ((field.min !== undefined && !Number.isFinite(field.min)) ||
        (field.max !== undefined && !Number.isFinite(field.max)) ||
        (field.min !== undefined && field.max !== undefined && field.min > field.max))) {
        throw new TypeError(`Invalid interaction range: ${key}`)
      }
      if (field.type === 'text' && field.maxLength !== undefined &&
        (!Number.isInteger(field.maxLength) || field.maxLength < 0)) throw new TypeError(`Invalid text length: ${key}`)
      fields[key] = field
    }
    if (!validateInteractionValue(fields[key]!, field.default)) throw new TypeError(`Invalid interaction default: ${key}`)
    for (const [id, value] of Object.entries(field.experiences ?? {})) {
      if (!EDITOR_EXPERIENCES.some(item => item.id === id) || !validateInteractionValue(fields[key]!, value)) {
        throw new TypeError(`Invalid interaction experience: ${key}.${id}`)
      }
    }
    for (const [mode, value] of Object.entries(field.presets ?? {})) {
      if (!['mixed', 'immersive', 'design'].includes(mode) || !validateInteractionValue(fields[key]!, value)) {
        throw new TypeError(`Invalid interaction preset: ${key}.${mode}`)
      }
    }
  }
  return freezeInteractionValue({namespace: definition.namespace, label: definition.label, fields}) as InteractionConfigDefinition<F>
}
