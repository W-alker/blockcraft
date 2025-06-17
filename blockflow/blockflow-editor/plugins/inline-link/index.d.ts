import { Subscription } from "rxjs";
import { Controller, IPlugin } from "../../core";
export declare class InlineLinkPlugin implements IPlugin {
    name: string;
    version: number;
    subscribe: Subscription;
    init(c: Controller): void;
    destroy(): void;
}
