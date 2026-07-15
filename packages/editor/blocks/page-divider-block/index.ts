import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {PageDividerBlockComponent} from "./page-divider.block";

export interface PageDividerBlockModel extends NoEditableBlockNative {
  flavour: 'page-divider',
  nodeType: BlockNodeType.void,
  props: {}
}

export const PageDividerBlockSchema: IBlockSchemaOptions<PageDividerBlockModel> = {
  flavour: 'page-divider',
  nodeType: BlockNodeType.void,
  component: PageDividerBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'page-divider',
      nodeType: BlockNodeType.void,
      props: {},
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "分页符",
    icon: "bc_icon bc_fenyefu"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'page-divider': PageDividerBlockComponent
    }

    interface IBlockCreateParameters {
      'page-divider': []
    }
  }
}
