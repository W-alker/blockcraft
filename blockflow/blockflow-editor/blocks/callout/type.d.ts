import { IEditableBlockModel } from "../../core";
export interface ICalloutBlockModel extends IEditableBlockModel {
    flavour: 'callout';
    props: {
        indent: number;
        ec: string | null;
        bc: string | null;
        c: string | null;
        emoji: string;
    };
}
