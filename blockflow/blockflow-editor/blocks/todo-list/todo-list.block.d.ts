import { EditableBlock } from "../../core";
import { ITodoListBlockModel } from "./type";
import * as i0 from "@angular/core";
export declare class TodoListBlock extends EditableBlock<ITodoListBlockModel> {
    placeholder: string;
    protected _date: Date | null;
    private _checked;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    setCheck(): void;
    toggleCheck(): void;
    openDatePicker(): void;
    onDatePickerChange(e: Date): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TodoListBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TodoListBlock, "div.todo-list", never, {}, {}, never, never, true, never>;
}
