export interface IContextMenuItem {
  flavour: string;
  icon: string;
  label: string;
  description?: string;
}

export interface IContextMenuEvent {
  type: 'block' | 'tool'
  item: IContextMenuItem
}
