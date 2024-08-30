import {BlockSchema, IBlockModelMap} from "@core/schemas";
import {BaseStore} from "@core/store";
import {DeltaInsert, IBlockFlavour} from "@core/types";
import {genUniqueID} from "@core/utils";

export class SchemaStore<BMap extends IBlockModelMap = IBlockModelMap> extends BaseStore<BlockSchema> {
  constructor(schemaList: BlockSchema[]) {
    super()
    schemaList.forEach(schema => {
      this.set(schema.flavour, schema)
    })
  }

  isDeltaInsert = (schema: BlockSchema, params: any[]): params is DeltaInsert[] => {
    return schema.nodeType === "editable" && params.length > 0 && typeof params[0] === 'object' && 'insert' in params[0]
  }

  createBlock = <Key extends keyof BMap>(flavour: Key, params?: any[]): BMap[Key] => {
    console.log('createBlock', flavour, params)
    const schema = this.get(flavour as IBlockFlavour)!
    if (!schema) throw new Error(`schema ${flavour as string} not found`)

    const createBefore = schema.onCreate?.(...(params || []))

    let children
    if (createBefore?.children) {
      if (this.isDeltaInsert(schema, createBefore.children)) {
        children = createBefore.children
      } else {
        children = createBefore.children.map((c) => this.createBlock(c.flavour, ...(c.params || [])))
      }
    } else {
      if (schema.nodeType === 'editable') {
        children = params || []
      } else {
        children = schema.children?.map(c => this.createBlock(c))
      }
    }
    return {
      id: genUniqueID(),
      flavour: schema.flavour,
      nodeType: schema.nodeType,
      children: children,
      props: createBefore?.props?.() || schema.props?.() || {},
      meta: createBefore?.props?.() || schema.meta?.() || {}
    } as BMap[Key]
  }
}
