export interface IToolbarMenuItem {
    name: string
    value: string | boolean | number
    icon?: string
    intro?: string
    children?: IToolbarMenuItem[],
}

