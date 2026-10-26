import type {
  BlockAgentActionEffect,
  BlockAgentCapabilityAction,
  BlockAgentCapabilityDefinition,
  InlineEmbedAgentCapabilityDefinition,
} from '@ccc/blockcraft'
import type {MarkdownAdapterManifest} from '@ccc/blockcraft'

export type DocumentAgentToolEffect = BlockAgentActionEffect

export type DocumentAgentCapabilityAction = BlockAgentCapabilityAction

interface DocumentAgentCapabilityBase {
  id: string
  title: string
  description: string
  domains?: readonly string[]
}

export type DocumentAgentBlockCapability = BlockAgentCapabilityDefinition

export type DocumentAgentInlineEmbedCapability =
  InlineEmbedAgentCapabilityDefinition

export interface DocumentAgentPluginCapability extends DocumentAgentCapabilityBase {
  kind: 'plugin'
  plugin: string
  actions?: readonly DocumentAgentCapabilityAction[]
}

export interface DocumentAgentToolCapability extends DocumentAgentCapabilityBase {
  kind: 'tool'
  name: string
  effect: DocumentAgentToolEffect
  parameters: Readonly<Record<string, unknown>>
  requiresConfirmation?: boolean
}

export interface DocumentAgentContextCapability extends DocumentAgentCapabilityBase {
  kind: 'context'
  provider: string
  sensitive?: boolean
  toolName?: string
}

export interface DocumentAgentSkillCapability extends DocumentAgentCapabilityBase {
  kind: 'skill'
  capabilityIds?: readonly string[]
  instructions?: string
}

export type DocumentAgentCapability =
  | DocumentAgentBlockCapability
  | DocumentAgentInlineEmbedCapability
  | DocumentAgentPluginCapability
  | DocumentAgentToolCapability
  | DocumentAgentContextCapability
  | DocumentAgentSkillCapability

export interface DocumentAgentCapabilityDescriptor {
  id: string
  extensionId: string
  kind: DocumentAgentCapability['kind']
  title: string
  description: string
  domains: readonly string[]
  effects: readonly DocumentAgentToolEffect[]
}

export interface DocumentAgentHostExtension {
  id: string
  version: string
  description: string
  capabilities: readonly DocumentAgentCapability[]
  toolHandlers?: Readonly<Record<string, DocumentAgentHostToolHandler>>
}

export interface DocumentAgentHostContext {
  module: string
  entityId?: string
  userRole?: string
  locale?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface DocumentAgentRuntimeManifest {
  protocolVersion: 1
  host?: DocumentAgentHostContext
  extensions: readonly {
    id: string
    version: string
    description: string
  }[]
  capabilityDirectory: readonly DocumentAgentCapabilityDescriptor[]
  /** Exact Markdown grammar exposed by the active host Adapter Registry. */
  markdown?: MarkdownAdapterManifest
}

export interface DocumentAgentHostToolExecutionContext {
  host?: DocumentAgentHostContext
  signal?: AbortSignal
  allowWrite: boolean
}

export type DocumentAgentHostToolHandler = (
  argumentsValue: unknown,
  context: DocumentAgentHostToolExecutionContext,
) => unknown | Promise<unknown>

export type DocumentAgentExtensionToolResult =
  | {ok: true; tool: string; data: unknown}
  | {ok: false; tool: string; error: string}

export interface DocumentAgentManifestOptions {
  registeredBlockFlavours?: readonly string[]
  registeredInlineEmbedKeys?: readonly string[]
}

type RegisteredCapability = {
  extensionId: string
  capability: DocumentAgentCapability
}

type RegisteredTool = {
  capability: DocumentAgentToolCapability
  handler: DocumentAgentHostToolHandler
}

/**
 * Runtime registry owned by the host application. It describes custom blocks,
 * plugins, context providers and semantic tools without exposing their
 * implementation objects to the model.
 */
export class DocumentAgentExtensionRegistry {
  private readonly extensions = new Map<string, DocumentAgentHostExtension>()
  private readonly capabilities = new Map<string, RegisteredCapability>()
  private readonly tools = new Map<string, RegisteredTool>()

  constructor(extensions: readonly DocumentAgentHostExtension[] = []) {
    for (const extension of extensions) this.register(extension)
  }

  register(extension: DocumentAgentHostExtension): () => void {
    assertIdentifier(extension.id, 'Extension')
    if (!extension.version.trim()) throw new Error(`Extension ${extension.id} is missing a version.`)
    if (!extension.description.trim()) throw new Error(`Extension ${extension.id} is missing a description.`)
    if (this.extensions.has(extension.id)) {
      throw new Error(`Agent extension ${extension.id} is already registered.`)
    }

    const seen = new Set<string>()
    const declaredBlockFlavours = new Set<string>()
    const declaredInlineEmbedKeys = new Set<string>()
    const declaredTools = new Map<string, DocumentAgentToolCapability>()
    for (const capability of extension.capabilities) {
      assertIdentifier(capability.id, 'Capability')
      if (seen.has(capability.id) || this.capabilities.has(capability.id)) {
        throw new Error(`Agent capability ${capability.id} is already registered.`)
      }
      seen.add(capability.id)
      if (capability.kind === 'block') {
        if (
          declaredBlockFlavours.has(capability.flavour) ||
          this.findRegisteredBlockCapability(capability.flavour)
        ) {
          throw new Error(`Agent block capability for ${capability.flavour} is already registered.`)
        }
        declaredBlockFlavours.add(capability.flavour)
      }
      if (capability.kind === 'inline-embed') {
        assertEmbedKey(capability.embedKey)
        if (
          declaredInlineEmbedKeys.has(capability.embedKey) ||
          this.findRegisteredInlineEmbedCapability(capability.embedKey)
        ) {
          throw new Error(
            `Agent inline Embed capability for ${capability.embedKey} is already registered.`,
          )
        }
        declaredInlineEmbedKeys.add(capability.embedKey)
      }
      if (capability.kind === 'tool') {
        if (declaredTools.has(capability.name) || this.tools.has(capability.name)) {
          throw new Error(`Agent tool ${capability.name} is already registered.`)
        }
        declaredTools.set(capability.name, capability)
      }
    }
    for (const [toolName, capability] of declaredTools) {
      if (typeof extension.toolHandlers?.[toolName] !== 'function') {
        throw new Error(`Agent tool ${capability.id} is missing handler ${toolName}.`)
      }
    }
    for (const toolName of Object.keys(extension.toolHandlers ?? {})) {
      if (!declaredTools.has(toolName)) {
        throw new Error(`Agent tool handler ${toolName} has no matching capability.`)
      }
    }

    const registeredExtension: DocumentAgentHostExtension = {
      ...extension,
      capabilities: [...extension.capabilities],
      toolHandlers: extension.toolHandlers ? {...extension.toolHandlers} : undefined,
    }
    this.extensions.set(extension.id, registeredExtension)
    for (const capability of registeredExtension.capabilities) {
      this.capabilities.set(capability.id, {
        extensionId: extension.id,
        capability,
      })
      if (capability.kind === 'tool') {
        this.tools.set(capability.name, {
          capability,
          handler: registeredExtension.toolHandlers![capability.name],
        })
      }
    }

    return () => {
      if (this.extensions.get(extension.id) !== registeredExtension) return
      this.extensions.delete(extension.id)
      for (const capability of registeredExtension.capabilities) {
        const registered = this.capabilities.get(capability.id)
        if (registered?.extensionId === extension.id) {
          this.capabilities.delete(capability.id)
        }
        if (capability.kind === 'tool' &&
            this.tools.get(capability.name)?.capability === capability) {
          this.tools.delete(capability.name)
        }
      }
    }
  }

  getCapability(
    capabilityId: string,
    options: DocumentAgentManifestOptions = {},
  ): DocumentAgentCapability | null {
    const registered = this.capabilities.get(capabilityId)
    if (!registered || !isCapabilityVisible(registered.capability, options)) return null
    return registered.capability
  }

  getBlockCapability(
    flavour: string,
    options: DocumentAgentManifestOptions = {},
  ): DocumentAgentBlockCapability | null {
    for (const {capability} of this.capabilities.values()) {
      if (
        capability.kind === 'block' &&
        capability.flavour === flavour &&
        isCapabilityVisible(capability, options)
      ) {
        return capability
      }
    }
    return null
  }

  getInlineEmbedCapability(
    embedKey: string,
    options: DocumentAgentManifestOptions = {},
  ): DocumentAgentInlineEmbedCapability | null {
    for (const {capability} of this.capabilities.values()) {
      if (
        capability.kind === 'inline-embed' &&
        capability.embedKey === embedKey &&
        isCapabilityVisible(capability, options)
      ) {
        return capability
      }
    }
    return null
  }

  private findRegisteredBlockCapability(flavour: string): DocumentAgentBlockCapability | null {
    for (const {capability} of this.capabilities.values()) {
      if (capability.kind === 'block' && capability.flavour === flavour) return capability
    }
    return null
  }

  private findRegisteredInlineEmbedCapability(
    embedKey: string,
  ): DocumentAgentInlineEmbedCapability | null {
    for (const {capability} of this.capabilities.values()) {
      if (capability.kind === 'inline-embed' && capability.embedKey === embedKey) {
        return capability
      }
    }
    return null
  }

  getCapabilityDirectory(
    options: DocumentAgentManifestOptions = {},
  ): readonly DocumentAgentCapabilityDescriptor[] {
    return [...this.capabilities.values()]
      .filter(({capability}) => isCapabilityVisible(capability, options))
      .map(({extensionId, capability}) => toCapabilityDescriptor(extensionId, capability))
  }

  createRuntimeManifest(
    host?: DocumentAgentHostContext | null,
    options: DocumentAgentManifestOptions = {},
  ): DocumentAgentRuntimeManifest {
    return {
      protocolVersion: 1,
      ...(host ? {host} : {}),
      extensions: [...this.extensions.values()].map(extension => ({
        id: extension.id,
        version: extension.version,
        description: extension.description,
      })),
      capabilityDirectory: this.getCapabilityDirectory(options),
    }
  }

  hasTool(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  async executeTool(
    toolName: string,
    argumentsValue: unknown,
    options: {
      host?: DocumentAgentHostContext
      signal?: AbortSignal
      allowWrite?: boolean
    } = {},
  ): Promise<DocumentAgentExtensionToolResult> {
    const registered = this.tools.get(toolName)
    if (!registered) {
      return {ok: false, tool: toolName, error: `Host Agent tool ${toolName} is not registered.`}
    }

    const requiresConfirmation =
      ['document-write', 'external-write'].includes(registered.capability.effect) ||
      registered.capability.requiresConfirmation === true
    if (requiresConfirmation && !options.allowWrite) {
      return {
        ok: true,
        tool: toolName,
        data: {
          requiresConfirmation: true,
          effect: registered.capability.effect,
        },
      }
    }

    try {
      const data = await registered.handler(argumentsValue, {
        ...(options.host ? {host: options.host} : {}),
        ...(options.signal ? {signal: options.signal} : {}),
        allowWrite: options.allowWrite === true,
      })
      return {ok: true, tool: toolName, data}
    } catch (error) {
      return {
        ok: false,
        tool: toolName,
        error: error instanceof Error ? error.message : `Host Agent tool ${toolName} failed.`,
      }
    }
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!value.trim() || !/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new Error(`${label} id must be a non-empty namespaced identifier.`)
  }
}

function assertEmbedKey(value: string): void {
  if (!value.trim()) {
    throw new Error('Inline Embed key must be non-empty.')
  }
}

function isCapabilityVisible(
  capability: DocumentAgentCapability,
  options: DocumentAgentManifestOptions,
): boolean {
  if (capability.kind === 'block' && options.registeredBlockFlavours) {
    return options.registeredBlockFlavours.includes(capability.flavour)
  }
  if (capability.kind === 'inline-embed' && options.registeredInlineEmbedKeys) {
    return options.registeredInlineEmbedKeys.includes(capability.embedKey)
  }
  return true
}

function toCapabilityDescriptor(
  extensionId: string,
  capability: DocumentAgentCapability,
): DocumentAgentCapabilityDescriptor {
  const effects = capability.kind === 'tool'
    ? [capability.effect]
    : 'actions' in capability
      ? (capability.actions ?? []).flatMap(action => action.effect ? [action.effect] : [])
      : []
  return {
    id: capability.id,
    extensionId,
    kind: capability.kind,
    title: capability.title,
    description: capability.description,
    domains: capability.domains ?? [],
    effects,
  }
}
