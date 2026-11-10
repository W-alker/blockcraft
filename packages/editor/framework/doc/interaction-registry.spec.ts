import {BehaviorSubject, Subscription} from 'rxjs'
import {DocPlugin} from '../plugin'
import {DocumentInteraction} from './interaction-mode'
import {EditorInteractionRegistry} from './interaction-policy'
import {defineInteractionConfig} from './interaction-schema'

const CUSTOM = defineInteractionConfig({namespace: 'customWidget', label: '自定义插件', fields: {
  enabled: {type: 'boolean', label: '启用入口', default: false, presets: {design: true}},
  placement: {type: 'select', label: '入口位置', default: 'left', options: [{value: 'left', label: '左侧'}, {value: 'right', label: '右侧'}]},
  delay: {type: 'number', label: '延迟', default: 100, min: 0, max: 500, integer: true},
  caption: {type: 'text', label: '入口名称', default: '工具', maxLength: 8},
}})
class CustomPlugin extends DocPlugin {
  override name = 'custom-widget'
  override readonly interactionConfigs = [CUSTOM]
  seen: unknown[] = []
  sub?: Subscription
  init() { this.sub = this.doc.interaction.policyChanges$.subscribe(() => this.seen.push(this.doc.interaction.get(CUSTOM))) }
  destroy() { this.sub?.unsubscribe() }
}

describe('per-document interaction registration', () => {
  const dispose: Array<() => void> = []
  afterEach(() => dispose.splice(0).forEach(fn => fn()))
  function setup(plugins: DocPlugin[] = [], interaction: any = {}) {
    const doc: any = {config: {plugins, interaction}, afterInit: () => {},
      event: {status: {isComposing: false}}, placement: {state: 'idle'}, dragController: {state: 'idle'},
      readonlySwitch$: new BehaviorSubject(false), isReadonly: false}
    doc.interaction = new DocumentInteraction(doc)
    dispose.push(() => {plugins.forEach(plugin => plugin.destroy()); doc.interaction.destroy()})
    return {doc, interaction: doc.interaction as DocumentInteraction}
  }

  it('collects declarations before plugin init and gives the plugin the initial override', () => {
    const plugin = new CustomPlugin()
    const h = setup([plugin], {preset: 'design', overrides: {plugins: {customWidget: {delay: 250}}}})
    expect(h.interaction.get(CUSTOM)).toEqual({enabled: true, placement: 'left', delay: 250, caption: '工具'})
    plugin.register(h.doc)
    expect(plugin.seen.length).toBe(1)
    h.interaction.setOverrides({plugins: {customWidget: {enabled: false}}})
    expect(plugin.seen.length).toBe(2)
    expect(h.interaction.get(CUSTOM).delay).toBe(100)
    expect(Object.isFrozen(h.interaction.get(CUSTOM))).toBeTrue()
    expect(() => h.interaction.get({...CUSTOM})).toThrowError(/Unregistered interaction declaration/)
  })

  it('resolves other plugin namespaces independent of init order', () => {
    const other = defineInteractionConfig({namespace: 'other', label: '另一插件', fields: {
      enabled: {type: 'boolean', label: '显示', default: true},
    }})
    class Other extends DocPlugin {
      override readonly interactionConfigs = [other]
      init() { expect(this.doc.interaction.get(CUSTOM).delay).toBe(320) }
      destroy() {}
    }
    const first = new Other(), second = new CustomPlugin()
    const h = setup([first, second], {overrides: {plugins: {customWidget: {delay: 320}}}})
    first.register(h.doc); second.register(h.doc)
    expect(h.interaction.definitions.map(definition => definition.namespace)).toEqual(['native', 'other', 'customWidget'])
  })

  it('late registration publishes once before init, leaves document and other instances alone', () => {
    const first = setup(), second = setup()
    const plugin = new CustomPlugin()
    const notifications: unknown[] = []
    first.interaction.policyChanges$.subscribe(value => notifications.push(value))
    plugin.register(first.doc)
    dispose.push(() => plugin.destroy())
    expect(plugin.seen.length).toBe(1)
    expect(notifications.length).toBe(2)
    first.interaction.registerPlugin(plugin)
    expect(notifications.length).toBe(2)
    expect(second.interaction.definitions.length).toBe(1)
    expect(() => second.interaction.get(CUSTOM)).toThrowError(TypeError)
  })

  it('binds declaration identity to its registered namespace even for caller-owned metadata', () => {
    const source = {...CUSTOM, namespace: 'mutableWidget'}
    class MutablePlugin extends DocPlugin {
      override readonly interactionConfigs = [source]
      init() {}
      destroy() {}
    }
    const h = setup([new MutablePlugin()])
    source.namespace = 'differentNamespace'
    expect(h.interaction.get(source).delay).toBe(100)
    expect(h.interaction.definitions[1]!.namespace).toBe('mutableWidget')
  })

  it('rejects conflicting registrations atomically and does not run init', () => {
    const h = setup([new CustomPlugin()])
    const before = h.interaction.snapshot
    const conflicting = new CustomPlugin()
    spyOn(conflicting, 'init')
    expect(() => conflicting.register(h.doc)).toThrowError(TypeError, /namespace/)
    expect(conflicting.init).not.toHaveBeenCalled()
    expect(h.interaction.snapshot).toBe(before)
    expect(h.interaction.definitions.length).toBe(2)
  })

  it('guards registration during input and after destruction', () => {
    const h = setup(), plugin = new CustomPlugin()
    h.doc.event.status.isComposing = true
    expect(() => plugin.register(h.doc)).toThrowError(/active input/)
    expect(h.interaction.definitions.length).toBe(1)
    h.doc.event.status.isComposing = false
    plugin.register(h.doc); plugin.destroy()
    h.interaction.destroy()
    expect(() => h.interaction.registerPlugin(new CustomPlugin())).toThrowError(/disposed/)
  })

  it('rejects unknown and invalid override values without changing the configuration or notifying', () => {
    const h = setup([new CustomPlugin()])
    const before = h.interaction.snapshot
    let notifications = 0
    h.interaction.policyChanges$.subscribe(() => notifications++)
    for (const fields of [{enabled: 1}, {placement: 'top'}, {delay: -1}, {delay: 501},
      {delay: NaN}, {delay: 2.5}, {caption: '超过八个字符长度的文本'}, {missing: true}]) {
      expect(h.interaction.setOverrides({plugins: {customWidget: fields}} as any)).toBeFalse()
    }
    expect(h.interaction.setOverrides({plugins: {uninstalled: {enabled: true}}})).toBeFalse()
    expect(h.interaction.snapshot).toBe(before)
    expect(notifications).toBe(1)
  })

  it('clears custom overrides on a preset switch and retains declaration metadata', () => {
    const h = setup([new CustomPlugin()])
    const definitions = h.interaction.definitions
    h.interaction.setOverrides({plugins: {customWidget: {enabled: false, placement: 'right'}}})
    h.interaction.set('design')
    expect(h.interaction.get(CUSTOM).enabled).toBeTrue()
    expect(h.interaction.get(CUSTOM).placement).toBe('left')
    expect(h.interaction.overrides).toEqual({})
    expect(h.interaction.definitions).toBe(definitions)
  })
})

describe('interaction declaration schema', () => {
  it('copies and freezes metadata without freezing caller-owned objects', () => {
    const source = {namespace: 'sample', label: '示例', fields: {side: {
      type: 'select' as const, label: '位置', default: 'a', options: [{value: 'a', label: 'A'}],
    }}}
    const definition = defineInteractionConfig(source)
    source.fields.side.options[0]!.label = 'CHANGED'
    expect(definition.fields.side.options[0]!.label).toBe('A')
    expect(Object.isFrozen(definition.fields.side.options[0])).toBeTrue()
    expect(Object.isFrozen(source)).toBeFalse()
  })

  it('rejects reserved or duplicate namespaces including duplicate declarations in a batch', () => {
    expect(() => new EditorInteractionRegistry([CUSTOM, CUSTOM])).toThrowError(TypeError)
    expect(() => new EditorInteractionRegistry([{...CUSTOM, namespace: 'native'}])).toThrowError(TypeError)
    expect(() => defineInteractionConfig({...CUSTOM, namespace: '__proto__'})).toThrowError(TypeError)
  })

  it('validates defaults, mode defaults and field constraints before publishing declarations', () => {
    for (const field of [
      {type: 'boolean', default: true, unknownConstraint: {}},
      {type: 'boolean', default: 'false'}, {type: 'unknown', default: true},
      {type: 'number', default: 1, min: 5, max: 0}, {type: 'number', default: Infinity},
      {type: 'number', default: 1, presets: {design: -1}, min: 0},
      {type: 'text', default: 'hello', maxLength: 2},
      {type: 'boolean', default: true, presets: {unknown: false}},
      {type: 'select', default: 'missing', options: [{value: 'a', label: 'A'}]},
      {type: 'select', default: 'a', options: [{value: 'a', label: 'A'}, {value: 'a', label: 'B'}]},
    ]) {
      expect(() => defineInteractionConfig({namespace: 'bad', label: '坏配置', fields: {option: {label: '选项', ...field}}} as any)).toThrowError(TypeError)
    }
  })
})
