import { Token } from "prismjs";
export type _Token = string | Token;
export declare function updateHighlightedTokens(container: HTMLElement, oldTokens: _Token[], newTokens: _Token[]): void;
