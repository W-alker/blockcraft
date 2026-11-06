/** Effects that a Block-owned Agent action may request from its host. */
export type BlockAgentActionEffect =
  | 'read'
  | 'document-preview'
  | 'document-write'
  | 'host-ui'
  | 'external-write'

export interface BlockAgentCapabilityAction {
  id: string
  title: string
  description: string
  effect?: BlockAgentActionEffect
}

/**
 * Declarative, runtime-independent contract that teaches a document Agent how
 * to understand and safely mutate one Block flavour.
 *
 * Keep this beside the Block implementation under `agent/`. Merely registering
 * a Schema does not opt the Block into Agent creation or property writes:
 * `createParameters` and `writableProps` are explicit, independent grants.
 */
export interface BlockAgentCapabilityDefinition {
  id: string
  kind: 'block'
  flavour: string
  schemaVersion?: number
  title: string
  description: string
  domains?: readonly string[]
  semanticRoles?: readonly string[]
  /** JSON Schema for the positional params passed to Schema.createSnapshot(). */
  createParameters?: Readonly<Record<string, unknown>>
  /** JSON Schema for a partial update-block-props payload. */
  writableProps?: Readonly<Record<string, unknown>>
  /** Structured props that must be replaced as one collaborative value. */
  atomicProps?: readonly string[]
  actions?: readonly BlockAgentCapabilityAction[]
  examples?: readonly Readonly<Record<string, unknown>>[]
}

export interface InlineEmbedAgentInsertDefinition {
  /** JSON Schema for the primitive value stored under `insert[embedKey]`. */
  value: Readonly<Record<string, unknown>>
  /** JSON Schema for the complete Delta attributes object. Omit to allow none. */
  attributes?: Readonly<Record<string, unknown>>
}

export interface InlineEmbedAgentExample {
  value: unknown
  attributes?: Readonly<Record<string, unknown>>
}

/**
 * Declarative, runtime-independent contract for one Inline Embed key.
 *
 * Keep it beside the converter under `embeds/<embed-key>/agent/`. A converter registration
 * makes existing Delta renderable; it does not grant Agent insertion. The
 * optional `insert` schema is the independent write grant.
 */
export interface InlineEmbedAgentCapabilityDefinition {
  id: string
  kind: 'inline-embed'
  embedKey: string
  title: string
  description: string
  domains?: readonly string[]
  semanticRoles?: readonly string[]
  insert?: InlineEmbedAgentInsertDefinition
  actions?: readonly BlockAgentCapabilityAction[]
  examples?: readonly InlineEmbedAgentExample[]
}

/** Preserve literal types while checking a Block-owned Agent declaration. */
export function defineBlockAgentCapability<
  const T extends BlockAgentCapabilityDefinition,
>(capability: T): T {
  return capability
}

/** Preserve literal types while checking an Inline-Embed-owned declaration. */
export function defineInlineEmbedAgentCapability<
  const T extends InlineEmbedAgentCapabilityDefinition,
>(capability: T): T {
  return capability
}
