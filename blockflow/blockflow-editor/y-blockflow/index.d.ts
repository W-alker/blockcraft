import { WebsocketProvider } from "y-websocket";
import { Awareness } from "y-protocols/awareness";
import { Controller } from "../core";
import { Subject } from "rxjs";
interface IConfig {
    serverUrl: string;
    roomName?: string;
}
interface IAwarenessUser {
    userId: string;
    userName?: string;
}
export declare class BlockflowBinding {
    controller: Controller;
    readonly config: IConfig;
    provider: WebsocketProvider;
    get yDoc(): import("yjs").Doc;
    protected statesMap: Map<number, {
        [p: string]: any;
    }>;
    readonly userStateUpdated$: Subject<{
        user: IAwarenessUser[];
        type: 'added' | 'removed' | 'updated';
    }>;
    readonly awareness: Awareness;
    constructor(controller: Controller, config: IConfig);
    connect(): void;
    getCurrentUsers(): IAwarenessUser[];
    private onAwarenessChange;
    disconnect(origin?: any): void;
    destroy(): void;
}
export {};
