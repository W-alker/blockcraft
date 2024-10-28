import {Type} from "@angular/core";
import {BlockFlowContextmenu} from "./index";

export interface IContextMenuItem {
  flavour: string;
  icon?: string;
  svgIcon?: string;
  label: string;
  description?: string;
}

export interface IContextMenuEvent {
  type: 'block' | 'tool'
  item: IContextMenuItem
}

export type IContextMenuComponent = Type<BlockFlowContextmenu>
