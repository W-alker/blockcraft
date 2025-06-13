import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {DividerBlockComponent} from "./divider.block";

export interface DividerBlockModel extends NoEditableBlockNative {
  flavour: 'divider',
  nodeType: BlockNodeType.void,
  props: {
    style?: string
    size?: string
  }
}

export const DividerBlockSchema: IBlockSchemaOptions<DividerBlockModel> = {
  flavour: 'divider',
  nodeType: BlockNodeType.void,
  component: DividerBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'divider',
      nodeType: BlockNodeType.void,
      props: {},
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "分割线",
    svgIcon: "bc_fengexian-color",
    icon: "bc_icon bc_fengexian-color"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      divider: DividerBlockComponent
    }

    interface IBlockCreateParameters {
      divider: []
    }
  }
}
