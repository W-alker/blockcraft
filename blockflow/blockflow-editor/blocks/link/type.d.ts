import { IBlockModel } from "../../core";
export interface ILinkBlockModel extends IBlockModel {
    flavour: 'link';
    nodeType: 'void';
    props: {
        href: string;
        text: string;
        appearance: 'card' | 'text';
    };
}
