import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {FormulaBlockComponent} from "./formula.block";

export interface FormulaBlockModel extends NoEditableBlockNative {
  flavour: 'formula',
  nodeType: BlockNodeType.void,
  props: {
    latex: string
  }
}

export const FormulaBlockSchema: IBlockSchemaOptions<FormulaBlockModel> = {
  flavour: 'formula',
  nodeType: BlockNodeType.void,
  component: FormulaBlockComponent,
  createSnapshot: (latex?: string) => {
    return {
      id: generateId(),
      flavour: 'formula',
      nodeType: BlockNodeType.void,
      props: {
        latex: latex || '',
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "公式",
    icon: "bc_icon bc_gongshi"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      formula: FormulaBlockComponent
    }

    interface IBlockCreateParameters {
      formula: [string?]
    }
  }
}
