import { Controller } from "../controller";
export interface IPlugin {
    readonly name: string;
    readonly version: number;
    init(controller: Controller): void;
    destroy(): void;
}
