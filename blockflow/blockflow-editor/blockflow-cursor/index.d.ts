import { CharacterIndex, Controller } from "../core";
export declare class BlockFlowCursor {
    readonly controller: Controller;
    constructor(controller: Controller);
    static createVirtualRange(id: string, start: CharacterIndex, end: CharacterIndex): HTMLSpanElement;
}
