import { ChangeDetectorRef, DestroyRef, ElementRef, EventEmitter } from "@angular/core";
import { IModeItem } from "./type";
import * as i0 from "@angular/core";
export declare class LangListComponent {
    private cdr;
    readonly destroyRef: DestroyRef;
    activeLang: string;
    langChange: EventEmitter<IModeItem>;
    destroy: EventEmitter<void>;
    input: ElementRef<HTMLInputElement>;
    langList: ElementRef<HTMLElement>;
    protected languageList: IModeItem[];
    protected hoverIdx: number;
    constructor(cdr: ChangeDetectorRef, destroyRef: DestroyRef);
    ngOnInit(): void;
    ngAfterViewInit(): void;
    onMouseEnter(e: MouseEvent): void;
    onMouseDown(e: MouseEvent): void;
    setHoverIdx(v: string): void;
    viewHoverLang(): void;
    onSearch(e: Event): void;
    onKeydown($event: KeyboardEvent): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LangListComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LangListComponent, "lang-list", never, { "activeLang": { "alias": "activeLang"; "required": false; }; }, { "langChange": "langChange"; "destroy": "destroy"; }, never, never, true, never>;
}
