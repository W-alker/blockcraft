export interface IToolbarMenuItem {
  name: string
  value: string | boolean | number | null
  icon?: string
  intro?: string
  children?: IToolbarMenuItem[],
  order?: number
}

