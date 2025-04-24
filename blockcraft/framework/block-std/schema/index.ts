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

  get(flavour: string) {
    const schema = this.schema.get(flavour)
    if (!schema) {
      throw new BlockCraftError(
        ErrorCode.SchemaValidateError,
        `Block schema ${flavour} not found`)
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
    parentSchema = typeof parentSchema === 'string' ? this.get(parentSchema) : parentSchema
    if (flavour === parentSchema.flavour ||
      parentSchema.nodeType === BlockNodeType.editable || parentSchema.nodeType === BlockNodeType.void) return false
    const excludeChildren = parentSchema.metadata.excludeChildren
    if (excludeChildren?.length) {
      for (const f of excludeChildren) {
        if (flavour.includes(f.replace('*', ''))) {
          return false
        }
      }
      return true
    }

    const includeChildren = parentSchema.metadata.includeChildren
    if (!includeChildren?.length) return false
    for (const f of includeChildren) {
      if (flavour.includes(f.replace('*', ''))) {
        return true
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
