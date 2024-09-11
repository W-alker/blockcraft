import {BlockSchema} from "@core/schemas";
import {BaseStore} from "@core/store";
import {DeltaInsert, IBlockFlavour, IBlockModel} from "@core/types";
import {genUniqueID} from "@core/utils";

export class SchemaStore extends BaseStore<IBlockFlavour, BlockSchema> {
  constructor(schemaList: BlockSchema[]) {
    super()
    schemaList.forEach(schema => {
      this.set(schema.flavour, schema)
    })
  }

  isDeltaInsert = (schema: BlockSchema, params: any[]): params is DeltaInsert[] => {
    return schema.nodeType === "editable" && params.length > 0 && typeof params[0] === 'object' && 'insert' in params[0]
  }

  create = (flavour: IBlockFlavour, params?: any[]): IBlockModel => {
    console.log('createBlock', flavour, params)
    const schema = this.get(flavour as IBlockFlavour)!
    if (!schema) throw new Error(`schema ${flavour as string} not found`)

    const createBefore = schema.onCreate?.(...(params || []))

    let children
    if (createBefore?.children) {
      if (this.isDeltaInsert(schema, createBefore.children)) {
        children = createBefore.children
      } else {
        children = createBefore.children.map((c) => this.create(c.flavour, ...(c.params || [])))
      }
    } else {
      if (schema.nodeType === 'editable') {
        children = params || []
      } else {
        children = schema.children?.map(c => this.create(c))
      }
    }
    return {
      id: genUniqueID(),
      flavour: schema.flavour,
      nodeType: schema.nodeType,
      children: children,
      props: createBefore?.props?.() || {},
      meta: createBefore?.meta?.() || {}
    }
  }
}
