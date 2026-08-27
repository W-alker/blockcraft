import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {PageDividerBlockComponent} from "./page-divider.block";

export * from './agent'

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
    description: "从当前位置开始新的一页",
    icon: "bc_icon bc_fenyefu",
    virtualization: {
      // Continuous layout paints a compact marker; paginated layout treats the
      // same model node as a zero-height manual page break.
      estimateHeight: ({layoutMode}) => layoutMode === 'paginated' ? 0 : 32,
    },
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
