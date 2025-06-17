import { CharacterIndex, ICharacterRange } from "../types";
export interface ICharacterPosition {
    node: Text | Element;
    offset: number;
    nodeOffset: number;
    beforeNodeCharacterCount: number;
}
export declare const characterIndex2Number: (index: CharacterIndex, length: number) => number;
export declare const findNodeByIndex: (ele: HTMLElement, index: number, findFrom?: ICharacterPosition) => ICharacterPosition;
export declare const createRangeByCharacterRange: (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => Range;
export declare const setCharacterRange: (el: HTMLElement, start: CharacterIndex, end: CharacterIndex) => void;
export declare const normalizeStaticRange: (container: HTMLElement, range: StaticRange) => ICharacterRange;
export declare const getCurrentCharacterRange: (activeElement: HTMLElement, range?: StaticRange) => ICharacterRange;
export declare const getElementCharacterOffset: (ele: HTMLElement, container: HTMLElement) => number;
export declare const setCursorAfter: (el: Node, sel?: Selection) => void;
export declare const setCursorBefore: (el: Node, sel?: Selection) => void;
export declare const isCursorAtElStart: (el: HTMLElement) => boolean;
export declare const isCursorAtElEnd: (el: HTMLElement) => boolean;
export declare const clearBreakElement: (container: HTMLElement) => void;
export declare const adjustRangeEdges: (container: HTMLElement, range?: Range | undefined) => boolean | undefined;
