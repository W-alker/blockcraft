export interface IToolbarMenuItem {
  name: string
  value: string | boolean | number | null
  active?: boolean
  icon?: string
  intro?: string
  children?: IToolbarMenuItem[],
  order?: number
}

