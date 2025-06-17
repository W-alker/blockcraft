import { CharacterIndex, DeltaOperation, IEditableBlockModel } from "../../types";
import { BaseBlock } from "./base-block";
import Y from '../../yjs';
import * as i0 from "@angular/core";
export declare class EditableBlock<Model extends IEditableBlockModel = IEditableBlockModel> extends BaseBlock<Model> {
    placeholder: string;
    protected _textAlign: string;
    protected _textIndent: string;
    yText: Y.Text;
    containerEle: HTMLElement;
    ngOnInit(): void;
    private oldHasContent;
    private setPlaceholder;
    ngAfterViewInit(): void;
    getTextDelta(): any;
    getTextContent(): string;
    get textLength(): number;
    setSelection(start: CharacterIndex, end?: CharacterIndex): void;
    forceRender(): void;
    applyDelta(deltas: DeltaOperation[], setSelection?: boolean): void;
    applyDeltaToModel(deltas: DeltaOperation[]): void;
    applyDeltaToView(deltas: DeltaOperation[], withSelection?: boolean, containerEle?: HTMLElement): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<EditableBlock<any>, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<EditableBlock<any>, ".editable-container", never, { "placeholder": { "alias": "placeholder"; "required": false; }; }, {}, never, never, true, never>;
}
