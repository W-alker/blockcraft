import {SimpleValue} from "../../global";

export interface IContextMenuItem {
  type: 'tool'
  name: string
  value: SimpleValue
  icon: string
  label: string
  desc?: string
}

export type customToolHandler = (item: IContextMenuItem, block: BlockCraft.BlockComponent<any>, doc: BlockCraft.Doc) => boolean
