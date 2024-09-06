export interface ISparkItem {
  flavour: string;
  icon: string;
  label: string;
  description?: string;
}

export interface ISparkEvent {
  type: 'block' | 'tool'
  item: ISparkItem
}
