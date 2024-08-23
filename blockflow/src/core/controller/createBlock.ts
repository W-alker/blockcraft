import {SchemaStore} from "@core/schemas";
import {IBlockModelMap} from "@core/controller/type";
import {genUniqueID} from "@core/utils";
import {DeltaInsert, IBlockFlavour} from "@core/types";

export const createBlock = <BMap extends IBlockModelMap, Key extends keyof BMap>(flavour: Key, store: SchemaStore, params?: any[]): BMap[Key] => {
  console.log('createBlock', flavour, store, params)
  const schema = store.get(flavour as IBlockFlavour)!
  if (!schema) throw new Error(`schema ${flavour as string} not found`)
  const createBefore = schema.onCreate?.(...(params || []))
  let children
  if (createBefore?.children) {
    // @ts-ignore
    if (!createBefore.children[0].flavour) {
      children = createBefore.children
    } else {
      // @ts-ignore
      children = createBefore.children.map(c => createBlock(c.flavour, store, ...(c.params || [])))
    }
  } else {
    children = schema.children?.map(c => createBlock(c, store))
  }
  return {
    id: genUniqueID(),
    flavour: schema.flavour,
    nodeType: schema.nodeType,
    children: children || [],
    props: createBefore?.props?.() || schema.props?.() || {},
    meta: createBefore?.props?.() || schema.meta?.() || {}
  } as BMap[Key]
}


