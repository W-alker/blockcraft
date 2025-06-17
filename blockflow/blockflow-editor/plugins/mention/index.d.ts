import { TemplateRef } from "@angular/core";
import { Controller, EmbedConverter, IPlugin } from "../../core";
export interface IMentionRequest {
    (keyword: string, type: MentionType): Promise<IMentionResponse>;
}
export type MentionType = 'user' | 'doc';
export interface IMentionResponse {
    list: IMentionData[];
    [key: string]: any;
}
export interface IMentionData {
    id: string;
    name: string;
    [key: string]: string | number | boolean;
}
export declare const MENTION_EMBED_CONVERTER: EmbedConverter;
export declare class MentionPlugin implements IPlugin {
    private request;
    private tpl?;
    private onMentionClick?;
    name: string;
    version: number;
    controller: Controller;
    private overlayRef?;
    private _dialog?;
    protected _activeTab: `${MentionType}`;
    private _vcr;
    private _mentionElement?;
    private _clickSub?;
    private _rootInputSub;
    private _mentionInputObserver;
    constructor(request: IMentionRequest, tpl?: TemplateRef<{
        item: IMentionData;
        type: MentionType;
    }> | undefined, onMentionClick?: ((attrs: {
        mentionId: string;
        mentionType: string;
    }, event: MouseEvent, controller: Controller) => void) | undefined);
    init(controller: Controller): void;
    subRootInput(): void;
    openMention(element: HTMLElement): void;
    showMentionDialog(): void;
    closeMention(): void;
    setMention(item: IMentionData): void;
    destroy(): void;
}
