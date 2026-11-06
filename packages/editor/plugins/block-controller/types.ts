import { TemplateRef, Type } from "@angular/core";
import { SimpleValue } from "../../global";
import { BlockReadonlyResolution, OverlayPosition } from "../../framework";

export type BlockMenuReadonlyBehavior = 'hide' | 'disable' | 'allow'

export interface IContextMenuItem {
  type: 'tool'
  name: string
  value: SimpleValue
  icon?: string
  svgIcon?: string
  label: string
  desc?: string
  readonlyBehavior?: BlockMenuReadonlyBehavior
}

export type customToolHandler = (item: IContextMenuItem, block: BlockCraft.BlockComponent<any> | null, doc: BlockCraft.Doc) => boolean

interface BlockMenuItemBase {
  name: string
  label?: string
  icon?: string
  svgIcon?: string
  desc?: string
  value?: SimpleValue
  data?: unknown
  disabled?: boolean
  active?: boolean
  hidden?: boolean
  /** Defaults to `disable` when the active block is readonly. */
  readonlyBehavior?: BlockMenuReadonlyBehavior
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
  svgIcon?: string
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
  /** Width of this dropdown's second-level panel. Defaults to the menu width. */
  menuWidth?: number
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
  readonlyBehavior?: BlockMenuReadonlyBehavior
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
  readonly: BlockReadonlyResolution
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

export const mergeBlockControllerOptions = (
  ...optionsList: Array<BlockControllerPluginOptions | null | undefined>
): BlockControllerPluginOptions => {
  const options = optionsList.filter(Boolean) as BlockControllerPluginOptions[]

  const customTools = options.flatMap(option => option.customTools || [])

  const customToolHandlers = options
    .map(option => option.customToolHandler)
    .filter((handler): handler is customToolHandler => typeof handler === 'function')

  const menuResolvers = options
    .map(option => option.blockMenuResolver)
    .filter((resolver): resolver is BlockMenuResolver => typeof resolver === 'function')

  const menuActionHandlers = options
    .map(option => option.blockMenuActionHandler)
    .filter((handler): handler is BlockMenuActionHandler => typeof handler === 'function')

  const positionResolver = options.find(option => !!option.positionResolver)?.positionResolver

  return {
    customTools,
    customToolHandler: customToolHandlers.length ? (item, block, doc) => {
      return customToolHandlers.some(handler => !!handler(item, block, doc))
    } : undefined,
    blockMenuResolver: menuResolvers.length ? (ctx) => {
      return menuResolvers.flatMap(resolver => resolver(ctx) || [])
    } : undefined,
    blockMenuActionHandler: menuActionHandlers.length ? (event, ctx) => {
      for (const handler of menuActionHandlers) {
        if (handler(event, ctx)) return true
      }
      return false
    } : undefined,
    positionResolver,
  }
}
