import { EditableBlockSchema} from "../../core";
import {ICodeBlockModel} from "./type";
import {CodeBlock} from "./code.block";

export const CodeBlockSchema: EditableBlockSchema<ICodeBlockModel['props']> = {
    flavour: 'code',
    nodeType: 'editable',
    render: CodeBlock,
    icon: 'bf_icon bf_daimakuai',
    label: '代码块',
    onCreate: (deltas) => {
        return {
            props: () => ({
                mode: 'javascript',
                indent: 0
            }),
            children: deltas
        }
    }
}
