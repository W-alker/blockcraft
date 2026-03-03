import { TemplateRef, Type } from "@angular/core";
import { SimpleValue } from "../../global";
import { OverlayPosition } from "../../framework";

export interface IContextMenuItem {
  type: 'tool'
  name: string
  value: SimpleValue
  icon: string
  label: string
  desc?: string
}

export type customToolHandler = (item: IContextMenuItem, block: BlockCraft.BlockComponent<any> | null, doc: BlockCraft.Doc) => boolean

interface BlockMenuItemBase {
  name: string
  label?: string
  icon?: string
  desc?: string
  value?: SimpleValue
  data?: unknown
  disabled?: boolean
  active?: boolean
  hidden?: boolean
}

export interface BlockMenuSimpleItem extends BlockMenuItemBase {
  type: 'simple'
}

export interface BlockMenuSwitchItem extends BlockMenuItemBase {
  type: 'switch'
  checked: boolean
}

export interface BlockMenuSortAction {
  key: string
  label?: string
  icon?: string
  value?: SimpleValue
  active?: boolean
  disabled?: boolean
}

export interface BlockMenuSortItem extends BlockMenuItemBase {
  type: 'sort'
  actions: BlockMenuSortAction[]
}

export interface BlockMenuDropdownItem extends BlockMenuItemBase {
  type: 'dropdown'
  items: BlockMenuItem[]
  positions?: OverlayPosition[]
  offsetX?: number
}

export interface BlockMenuCustomItem extends BlockMenuItemBase {
  type: 'custom'
  template?: TemplateRef<unknown>
  templateContext?: Record<string, unknown>
  component?: Type<unknown>
  componentInputs?: Record<string, unknown>
}

export interface BlockMenuDividerItem {
  type: 'divider'
  name: string
  hidden?: boolean
}

export type BlockMenuItem =
  | BlockMenuSimpleItem
  | BlockMenuSwitchItem
  | BlockMenuSortItem
  | BlockMenuDropdownItem
  | BlockMenuCustomItem
  | BlockMenuDividerItem

export interface BlockMenuSection {
  key: string
  title?: string
  items: BlockMenuItem[]
}

export interface BlockMenuContext {
  activeBlock: BlockCraft.BlockComponent
  doc: BlockCraft.Doc
  findClosestBlock: (flavour: BlockCraft.BlockFlavour | string) => BlockCraft.BlockComponent | null
}

export interface BlockMenuActionEvent {
  item: BlockMenuItem
  source: 'simple' | 'switch' | 'sort'
  checked?: boolean
  sortAction?: BlockMenuSortAction
  path: BlockMenuDropdownItem[]
}

export type BlockMenuResolver = (ctx: BlockMenuContext) => BlockMenuSection[] | null | undefined
export type BlockMenuActionHandler = (event: BlockMenuActionEvent, ctx: BlockMenuContext) => boolean | void

export interface BlockControllerPositionContext {
  activeBlock: BlockCraft.BlockComponent
  parentBlock: BlockCraft.BlockComponent | null
  left: number
  top: number
}

export interface BlockControllerPositionResult {
  x: number
  y: number
}

export type BlockControllerPositionResolver = (ctx: BlockControllerPositionContext) => BlockControllerPositionResult

export interface BlockControllerPluginOptions {
  customTools?: IContextMenuItem[]
  customToolHandler?: customToolHandler
  blockMenuResolver?: BlockMenuResolver
  blockMenuActionHandler?: BlockMenuActionHandler
  positionResolver?: BlockControllerPositionResolver
}
