import {BlockSchemaOptions} from "./block-schema";
import {BlockCraftError, ErrorCode} from "../../global";

export class SchemaManager {

  constructor(
    private readonly blockSchema: BlockSchemaOptions[]
  ) {
    this.blockSchema.forEach(schema => this.register(schema))
  }

  private schema: Map<string, BlockSchemaOptions> = new Map()

  register(schema: BlockSchemaOptions) {
    this.schema.set(schema.flavour, schema)
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
    return this.schema.values()
  }

  createSnapshot<T extends BlockCraft.BlockFlavour>(flavour: T, params: BlockCraft.BlockCreateParameters<T>) {
    const schema = this.get(flavour)
    return schema.createSnapshot(...(params as any))
  }

  /**
   * Validate if the children flavour is valid
   * @param flavour
   * @param parentSchema
   */
  isValidChildren(flavour: string, parentSchema: BlockSchemaOptions) {
    const childrenSchema = parentSchema.metadata.children
    if (!childrenSchema?.length) return false
    for (const child of childrenSchema) {
      if (flavour.includes(child.replace('*', ''))) {
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
