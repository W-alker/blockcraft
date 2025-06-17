import { IEditableBlockModel } from "../../core";
export interface IMermaidBlockModel extends IEditableBlockModel {
    flavour: 'mermaid';
    nodeType: 'editable';
    props: {
        indent: number;
        view: 'text' | 'graph';
    };
}
