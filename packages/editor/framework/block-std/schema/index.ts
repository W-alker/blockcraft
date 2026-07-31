import {IBlockSchemaOptions} from "./block-schema";
import {BlockCraftError, ErrorCode} from "../../../global";
import {BlockNodeType} from "../types";

export class SchemaManager {

  constructor(
    private readonly blockSchema: IBlockSchemaOptions[]
  ) {
    this.blockSchema.forEach(schema => this.register(schema))
  }

  private schema: Map<string, IBlockSchemaOptions> = new Map()

  register(schema: IBlockSchemaOptions) {
    this.schema.set(schema.flavour, schema)
  }

  has(flavour: string) {
    return this.schema.has(flavour)
  }

  get(flavour: string, throwError = true) {
    const schema = this.schema.get(flavour)
    if (!schema) {
      if (throwError) {
        throw new BlockCraftError(ErrorCode.SchemaValidateError, `Schema not found for ${flavour}`)
      }
      return null
    }
    return schema
  }

  getSchemaList() {
    return [...this.schema.values()]
  }

  createSnapshot<T extends BlockCraft.BlockFlavour>(flavour: T, params: BlockCraft.BlockCreateParameters<T>) {
    const schema = this.get(flavour)
    // @ts-ignore
    return schema.createSnapshot(...(params as any))
  }

  /**
   * Validate if the children flavour is valid
   * @param flavour
   * @param parentSchema
   */
  isValidChildren(flavour: BlockCraft.BlockFlavour, parentSchema: BlockCraft.BlockFlavour | IBlockSchemaOptions) {
    parentSchema = typeof parentSchema === 'string' ? this.get(parentSchema)! : parentSchema
    const currentSchema = this.get(flavour)
    if (!currentSchema || (currentSchema.metadata.isLeaf && parentSchema.flavour === 'root')) return false
    if (flavour === parentSchema.flavour ||
      parentSchema.nodeType === BlockNodeType.editable || parentSchema.nodeType === BlockNodeType.void) return false
    const excludeChildren = parentSchema.metadata.excludeChildren
    // TODO 迁移 这里子元素验证需要迁移
    if (excludeChildren?.length) {
      for (const f of excludeChildren) {
        if (matchesBlockFlavourPattern(flavour, f)) return false
      }
      return true
    }

    const includeChildren = parentSchema.metadata.includeChildren
    if (!includeChildren?.length) return false
    for (const f of includeChildren) {
      if (matchesBlockFlavourPattern(flavour, f)) return true
    }
    return false
  }

  /**
   * Combine the immutable Schema contract with opt-in instance metadata.
   * Instance rules may only narrow the static result.
   */
  isValidChildrenForInstance(
    flavour: BlockCraft.BlockFlavour,
    parentSchema: BlockCraft.BlockFlavour | IBlockSchemaOptions,
    parentMeta: Record<string, unknown>,
  ): boolean {
    parentSchema =
      typeof parentSchema === 'string'
        ? this.get(parentSchema)!
        : parentSchema
    if (!this.isValidChildren(flavour, parentSchema)) return false
    if (!parentSchema.metadata.instanceMeta?.childConstraints) return true
    return evaluateInstanceChildConstraints(flavour, parentMeta).allowed
  }

}

/** Match the historical Schema flavour pattern syntax (`*`, `table-*`, `*-embed`). */
export function matchesBlockFlavourPattern(
  flavour: string,
  pattern: string,
): boolean {
  return pattern.includes('*')
    ? flavour.includes(pattern.replaceAll('*', ''))
    : flavour === pattern
}

export interface InstanceChildConstraintResult {
  allowed: boolean
  malformed: boolean
}

function readInstancePatterns(
  meta: Record<string, unknown>,
  key: 'incl' | 'excl',
): {present: boolean; patterns: string[]; malformed: boolean} {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) {
    return {present: false, patterns: [], malformed: false}
  }
  const raw = meta[key]
  if (
    !Array.isArray(raw) ||
    raw.some(value => typeof value !== 'string' || value.trim().length === 0)
  ) {
    return {present: true, patterns: [], malformed: true}
  }
  return {
    present: true,
    patterns: [...new Set(raw)],
    malformed: false,
  }
}

/**
 * Evaluate opt-in instance constraints. A malformed persisted rule fails
 * closed without rewriting the document.
 */
export function evaluateInstanceChildConstraints(
  flavour: string,
  meta: Record<string, unknown>,
): InstanceChildConstraintResult {
  const include = readInstancePatterns(meta, 'incl')
  const exclude = readInstancePatterns(meta, 'excl')
  if (include.malformed || exclude.malformed) {
    return {allowed: false, malformed: true}
  }
  if (
    exclude.present &&
    exclude.patterns.some(pattern => matchesBlockFlavourPattern(flavour, pattern))
  ) {
    return {allowed: false, malformed: false}
  }
  if (!include.present) return {allowed: true, malformed: false}
  return {
    allowed: include.patterns.some(pattern =>
      matchesBlockFlavourPattern(flavour, pattern),
    ),
    malformed: false,
  }
}

declare global {
  namespace BlockCraft {
    type SchemaManager = InstanceType<typeof SchemaManager>

    interface IBlockCreateParameters {
      [K: string]: any[]
    }

    type BlockCreateParameters<T extends keyof IBlockCreateParameters> = IBlockCreateParameters[T]
  }
}

export * from "./block-schema"
