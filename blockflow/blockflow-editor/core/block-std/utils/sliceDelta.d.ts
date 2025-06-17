import { DeltaInsert } from "../../types";
export declare function sliceDelta(delta: DeltaInsert[], start?: number, end?: number): {
    attributes?: import("../../types").IInlineAttrs | undefined;
    insert: string | {
        [key: string]: import("../../types").SimpleBasicType;
    };
}[];
export default sliceDelta;
