import { Pipe, type PipeTransform } from "@angular/core";
import { quantizeObjectFormatNumber } from "../../framework/block-std/block/object-format/object-format-number";

/** 仅投影工具栏读数；浏览旧值时不触发文档回写。 */
@Pipe({ name: "objectFormatNumber", standalone: true })
export class ObjectFormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, step = 0.01): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    // 传入控件的值与显示值一致，避免仅聚焦再失焦就触发精度回写。
    return quantizeObjectFormatNumber(value, step);
  }
}
