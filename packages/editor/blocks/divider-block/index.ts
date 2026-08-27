import {generateId, NoEditableBlockNative} from "../../framework";
import {BlockNodeType, IBlockSchemaOptions} from "../../framework";
import {DividerBlockComponent} from "./divider.block";

export * from './agent'

export type DividerLength = 'short' | 'medium' | 'long' | 'full';
export type DividerThickness = 'thin' | 'regular' | 'thick';

export interface DividerBlockModel extends NoEditableBlockNative {
  flavour: 'divider',
  nodeType: BlockNodeType.void,
  props: {
    style?: string
    /** @deprecated Use length and thickness instead. Retained for legacy snapshots. */
    size?: string
    length?: DividerLength
    thickness?: DividerThickness
    /** Overall divider opacity, normalized to the 0.1–1 range when rendered. */
    opacity?: number
    text?: string
    align?: 'left' | 'center' | 'right'
    color?: string
    lineColor?: string
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    letterSpacing?: number
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
    description: "分隔上下内容区域",
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
