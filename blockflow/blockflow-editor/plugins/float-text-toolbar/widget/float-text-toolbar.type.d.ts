export interface IToolbarMenuItem {
    label?: string;
    name: string;
    value: string | boolean | number | null;
    active?: boolean;
    icon?: string;
    intro?: string;
    children?: IToolbarMenuItem[];
    order?: number;
    divide?: boolean;
}
