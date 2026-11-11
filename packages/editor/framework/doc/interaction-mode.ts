import {EDITOR_EXPERIENCES, type EditorExperience} from './editing-experience'
import {BehaviorSubject, Subscription} from 'rxjs'

import {EditorInteractionRegistry, type EditorInteractionMode, type EditorInteractionConfig, type EditorInteractionOverrides} from './interaction-policy'
export type {EditorInteractionMode} from './interaction-policy'
import type {InteractionConfigDefinition, InteractionConfigValues, InteractionField} from './interaction-schema'
import type {DocPlugin} from '../plugin'

// These are editor controls, never document content. Keep native forms and
// embedded applications on their existing event path in every mode.
const CHROME = 'bc-drag-handle, bc-object-corner-controls, bc-object-edge-controls, block-resizer, shape-resizer, shape-geometry-editor, shape-adjustment-editor, .object-group-block__move-edge, [data-bc-object-drag-handle]'

/** Local interaction intent. Design exposes focused-object controls without
 * changing text selection. Selection/Placement/DnD keep their existing paths.
 * No document data, layout conversion, history or collaborative state lives here.
 */
export class DocumentInteraction {
  private registry = new EditorInteractionRegistry()
  private readonly registeredPlugins = new WeakSet<DocPlugin>()
  private readonly definitionTokens = new WeakMap<InteractionConfigDefinition, string>()
  private current = this.registry.resolve()
  private readonly policyState = new BehaviorSubject(this.current)
  /** Emits the complete, immutable configuration after DOM projection. */
  readonly policyChanges$ = this.policyState.asObservable()
  private readonly state = new BehaviorSubject<EditorInteractionMode>('mixed')
  readonly changes$ = this.state.asObservable()
  private readonly subscriptions = new Subscription()
  private host: HTMLElement | null = null
  private pointerActive = false
  private disposed = false
  private cleanup: (() => void) | null = null

  constructor(private readonly doc: BlockCraft.Doc) {
    const plugins = doc.config.plugins ?? []
    this.registry = new EditorInteractionRegistry(plugins.flatMap(plugin => [...plugin.interactionConfigs]))
    plugins.forEach(plugin => {
      this.registeredPlugins.add(plugin)
      plugin.interactionConfigs.forEach(definition => this.definitionTokens.set(definition, definition.namespace))
    })
    this.current = this.registry.resolve(doc.config.interaction?.experience !== undefined
      ? doc.config.interaction
      : {...doc.config.interaction, preset: doc.config.interaction?.preset ?? doc.config.interactionMode ?? 'mixed'})
    this.policyState.next(this.current)
    this.state.next(this.current.preset)
    // Track active gestures before plugin listeners. Design uses the existing
    // text/selection paths; only hidden layout controls are intercepted.
    doc.afterInit(root => this.attach(root.hostElement))
  }

  get value(): EditorInteractionMode { return this.current.preset }

  /** Metadata for native capabilities and only the plugins installed in this document. */
  get definitions() { return this.registry.definitions }
  get presets() { return this.registry.presets }
  get experiences() { return this.registry.experiences }
  /** Selected experience intent; custom overrides may differ from its defaults. */
  get experience(): EditorExperience | null { return this.current.experience ?? null }
  /** Effective default match, or null for a custom combination. */
  get matchingExperience(): EditorExperience | null {
    const actual = JSON.stringify(this.policy)
    if (this.experience && JSON.stringify(this.experiences[this.experience]) === actual) return this.experience
    return EDITOR_EXPERIENCES.find(item => JSON.stringify(this.experiences[item.id]) === actual)?.id ?? null
  }

  setExperience(experience: EditorExperience, overrides?: EditorInteractionOverrides): boolean {
    return this.configure({experience, overrides})
  }

  get<F extends Readonly<Record<string, InteractionField>>>(definition: InteractionConfigDefinition<F>): InteractionConfigValues<F> {
    const namespace = this.definitionTokens.get(definition)
    if (!namespace) throw new TypeError(`Unregistered interaction declaration: ${definition.namespace}`)
    const value = this.policy.plugins[namespace]
    if (!value) throw new TypeError(`Unregistered interaction namespace: ${definition.namespace}`)
    return value as InteractionConfigValues<F>
  }

  /** Called before a late plugin's init. No change is published until all declarations validate. */
  registerPlugin(plugin: DocPlugin): void {
    if (this.disposed) throw new Error('Interaction configuration is disposed')
    if (this.registeredPlugins.has(plugin)) return
    if (!plugin.interactionConfigs.length) { this.registeredPlugins.add(plugin); return }
    if (this.isBusy()) throw new Error('Cannot register interaction configuration during an active input or gesture')
    const registry = new EditorInteractionRegistry([...this.registry.definitions.slice(1), ...plugin.interactionConfigs])
    const next = registry.resolve(this.current)
    this.registry = registry
    plugin.interactionConfigs.forEach(definition => this.definitionTokens.set(definition, definition.namespace))
    this.registeredPlugins.add(plugin)
    this.current = next
    this.project()
    this.policyState.next(next)
  }

  private isBusy(): boolean {
    return this.pointerActive || this.doc.event.status.isComposing || this.doc.dragController.state !== 'idle' ||
      this.doc.placement.state !== 'idle'
  }

  get policy() { return this.current.policy }
  get overrides() { return this.current.overrides }
  get snapshot() { return this.current }

  /** Select a preset and clear custom overrides, including when selecting the same preset. */
  set(mode: EditorInteractionMode): boolean {
    return ['mixed', 'immersive', 'design'].includes(mode) && this.configure({preset: mode})
  }

  /** Replace overrides; an empty object restores the active experience or preset. */
  setOverrides(overrides: EditorInteractionOverrides): boolean {
    return this.configure({...this.current, overrides})
  }

  /** Atomic replacement. False for invalid input or while IME/pointer/movement is active. */
  configure(config: EditorInteractionConfig): boolean {
    if (this.disposed) return false
    let next: typeof this.current
    try { next = this.registry.resolve(config) } catch { return false }
    if (JSON.stringify(next) === JSON.stringify(this.current)) return true
    if (this.isBusy()) return false
    const previousMode = this.value
    this.current = next
    this.project()
    this.policyState.next(next)
    if (previousMode !== next.preset) this.state.next(next.preset)
    return true
  }

  private attach(host: HTMLElement): void {
    if (this.disposed || this.host) return
    this.host = host
    this.project()
    this.subscriptions.add(this.doc.readonlySwitch$.subscribe(() => this.project()))
    const owner = host.ownerDocument
    const listeners: Array<[string, EventListener]> = [
      ['pointerdown', this.onPointerDown as EventListener],
      ['pointerup', this.onPointerEnd],
      ['pointercancel', this.onPointerEnd],
      ['click', this.onClick as EventListener],
    ]
    this.doc.ngZone.runOutsideAngular(() => {
      for (const [name, listener] of listeners) owner.addEventListener(name, listener, true)
      owner.defaultView?.addEventListener('blur', this.onPointerEnd)
    })
    this.cleanup = () => {
      for (const [name, listener] of listeners) owner.removeEventListener(name, listener, true)
      owner.defaultView?.removeEventListener('blur', this.onPointerEnd)
    }
  }

  private attribute(key: string): string {
    return 'data-bc-interaction-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())
  }

  private project(): void {
    this.host?.setAttribute('data-bc-interaction-mode', this.doc.isReadonly ? 'mixed' : this.value)
    for (const [key, value] of Object.entries(this.policy.native)) {
      this.host?.setAttribute(this.attribute(key), String(!this.doc.isReadonly && value))
    }
  }

  private target(event: Event): Element | null {
    if (this.policy.native.layoutControls || this.doc.isReadonly || event.defaultPrevented) return null
    const target = event.target instanceof Element ? event.target : null
    return target && this.host?.contains(target) ? target : null
  }

  private consume(event: Event): void {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0 && event.target instanceof Node && this.host?.contains(event.target)) {
      this.pointerActive = true
    }
    const target = this.target(event)
    if (!target || event.button !== 0) return
    if (target.closest(CHROME)) this.consume(event)
  }

  private onPointerEnd = (): void => { this.pointerActive = false }

  private onClick = (event: MouseEvent): void => {
    const target = this.target(event)
    if (target && target.closest(CHROME)) this.consume(event)
  }

  destroy(): void {
    this.disposed = true
    this.cleanup?.()
    this.cleanup = null
    this.subscriptions.unsubscribe()
    this.host?.removeAttribute('data-bc-interaction-mode')
    for (const key of Object.keys(this.policy.native)) this.host?.removeAttribute(this.attribute(key))
    this.host = null
    this.state.complete()
    this.policyState.complete()
  }
}

/** Compatibility alias; both APIs share one state owner. */
export {DocumentInteraction as DocumentInteractionMode}
