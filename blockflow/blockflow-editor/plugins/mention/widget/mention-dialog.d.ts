import { ChangeDetectorRef, ElementRef, EventEmitter, TemplateRef } from "@angular/core";
import { IMentionData, MentionType } from "../index";
import * as i0 from "@angular/core";
export declare class MentionDialog {
    private elementRef;
    readonly cdr: ChangeDetectorRef;
    top: number;
    left: number;
    template?: TemplateRef<{
        item: IMentionData;
        type: MentionType;
    }>;
    list: IMentionData[];
    tabChange: EventEmitter<MentionType>;
    itemSelect: EventEmitter<IMentionData>;
    close: EventEmitter<boolean>;
    protected readonly MENTION_TABS: {
        label: string;
        type: MentionType;
    }[];
    mousedown(event: MouseEvent): void;
    constructor(elementRef: ElementRef<HTMLElement>, cdr: ChangeDetectorRef);
    activeTabIndex: number;
    protected selectIndex: number;
    moveSelect(direction: 'up' | 'down'): void;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    onItemClick(e: Event, item: IMentionData): void;
    onSure(): void;
    onTabChange(index: number): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<MentionDialog, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<MentionDialog, "mention-dialog", never, { "top": { "alias": "top"; "required": false; }; "left": { "alias": "left"; "required": false; }; "template": { "alias": "template"; "required": false; }; "list": { "alias": "list"; "required": false; }; }, { "tabChange": "tabChange"; "itemSelect": "itemSelect"; "close": "close"; }, never, never, true, never>;
}
