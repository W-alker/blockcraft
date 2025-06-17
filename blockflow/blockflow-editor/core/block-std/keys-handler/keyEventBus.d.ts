import { Controller } from "../../controller";
export interface IKeyEventTrigger {
    (event: KeyboardEvent): boolean;
}
export interface IKeyEventHandler {
    (event: KeyboardEvent, controller: Controller): void;
}
export interface IHandler {
    trigger: IKeyEventTrigger;
    handler: IKeyEventHandler;
}
export declare class KeyEventBus {
    readonly controller: Controller;
    private readonly handlers;
    constructor(controller: Controller);
    add(handler: IHandler): void;
    remove(trigger: IKeyEventTrigger): void;
    handle(event: KeyboardEvent): boolean;
}
