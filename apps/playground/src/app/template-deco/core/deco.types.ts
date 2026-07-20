import { Type } from '@angular/core'
import { IBlockSchemaOptions, IBlockSnapshot, NativeBlockModel, generateId } from '@ccc/blockcraft'
import { MaterialKind } from './deco.category'

export interface DecoDef<M extends NativeBlockModel = NativeBlockModel> {
  flavour: M['flavour']
  nodeType: M['nodeType']
  label: string
  svgIcon: string
  defaultProps: M['props'],
  templateEdit: Type<unknown>            // 模板编辑界面用的组件
  templateRender: Type<unknown>          // 文档界面用的组件
}

export interface DecoRegistration<M extends NativeBlockModel = NativeBlockModel> {
  kind: MaterialKind.Block
  def: DecoDef<M>
  templateEditSchema: IBlockSchemaOptions<M>      // 同 flavour，component = templateEdit
  templateRenderSchema: IBlockSchemaOptions<M>    // 同 flavour，component = templateRender
}

/** 一个装饰定义 → 两套 schema（同 flavour、不同 component）。 */
export function defineDeco<M extends NativeBlockModel>(d: DecoDef<M>): DecoRegistration<M> {
  const base = {
    flavour: d.flavour,
    nodeType: d.nodeType,
    // void 装饰：createSnapshot 无参，props 取默认。机制①靠“过哪本字典”分流，快照里只存 flavour+props。
    createSnapshot: (): IBlockSnapshot => ({
      id: generateId(),
      flavour: d.flavour,
      nodeType: d.nodeType,
      props: { ...d.defaultProps },
      meta: {},
      children: [],
    }),
    // metadata 只放框架认的字段：version/label/svgIcon。category 不在这（框架 metadata 无此字段）。
    metadata: { version: 1, label: d.label, svgIcon: d.svgIcon },
  }
  return {
    kind: MaterialKind.Block,
    def: d,
    templateEditSchema: { ...base, component: d.templateEdit } as IBlockSchemaOptions<M>,
    templateRenderSchema: { ...base, component: d.templateRender } as IBlockSchemaOptions<M>,
  }
}
