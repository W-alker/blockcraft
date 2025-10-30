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
        if (f.includes('*')) {
          if (flavour.includes(f.replaceAll('*', ''))) return false
        } else {
          if (flavour === f) return false
        }
      }
      return true
    }

    const includeChildren = parentSchema.metadata.includeChildren
    if (!includeChildren?.length) return false
    for (const f of includeChildren) {
      if (f.includes('*')) {
        if (flavour.includes(f.replaceAll('*', ''))) return true
      } else {
        if (flavour === f) return true
      }
    }
    return false
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
