import { BlockModel, Controller, EditableBlock, IBlockFlavour, IPlugin } from "../../core";
export { BlockTransformContextMenu } from "./widget/contextmenu";
export interface IBlockTransformConfig {
    flavour: string;
    description: string;
    markdown?: RegExp;
    hotkey?: (e: KeyboardEvent) => boolean;
    onConvert?: (controller: Controller, from: EditableBlock, matchedString: string) => BlockModel;
}
export declare const blockTransforms: IBlockTransformConfig[];
export declare class BlockTransformPlugin implements IPlugin {
    readonly transformList: IBlockTransformConfig[];
    name: string;
    version: number;
    private _controller;
    private mdTransformList;
    constructor(transformList?: IBlockTransformConfig[]);
    private sub;
    static transformEditableBlock: (controller: Controller, from: EditableBlock, to: IBlockFlavour) => void;
    init(controller: Controller): void;
    private contextOvr;
    private closeMenu$;
    openContextMenu(block: EditableBlock): void;
    destroy(): void;
}
