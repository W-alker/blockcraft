import {BaseStore} from "../store";
import {DeltaInsert, IBlockFlavour, IBlockModel} from "../types";
import {BlockSchema} from "./block-schema.type";
import {genUniqueID} from "../utils";


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
        children = params?.[0] || []
      } else {
        children = schema.children?.map(c => this.create(c))
      }
    }

    let props = createBefore?.props?.() || {}
    if (schema.nodeType === 'editable') {
      props['indent'] ??= params?.[1]?.indent || 0
      props['textAlign'] = 'left'
    }
    return {
      id: genUniqueID(),
      flavour: schema.flavour,
      nodeType: schema.nodeType,
      children: children || [],
      props,
      meta: createBefore?.meta?.() || {}
    }
  }
}
