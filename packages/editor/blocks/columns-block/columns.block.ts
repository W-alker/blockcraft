import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent, ORIGIN_SYSTEM_REPAIR } from "../../framework";
import { ColumnsBlockModel, ColumnBlockSchema } from "./index";
import { CsTooltipDirective } from "@cses/ui";

/**
 * 多栏布局容器组件
 *
 * 新架构：
 * - columns-block 包含多个 column-block 子块
 * - 每个 column-block 有自己的 children-render-container
 * - 支持拖拽调整列宽
 * - 支持增删列
 */
@Component({
  selector: 'div.columns-block',
  template: `
    <div class="columns-wrapper">
      <!-- 子块渲染容器，框架会渲染 column-block 子块 -->
      <div class="children-render-container columns-layout">
      </div>

      <!-- 列之间的可拖拽分割线 -->
      @if (!isReadonly && dividerArray.length > 0) {
        @for (i of dividerArray; track i) {
          <div class="column-divider"
               [attr.data-divider-index]="i"
               (mousedown)="startResize($event, i)"
               contenteditable="false">
            <div class="add-point" csTooltip="添加列" (mousedown)="addColumn($event, i + 1)"></div>
            <div class="divider-line"></div>
          </div>
        }
      }
      @if(!isReadonly && dividerArray.length < 7) {
        <div class="column-divider">
          <div class="add-point" csTooltip="添加列" (mousedown)="addColumn($event)"></div>
        </div>
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsTooltipDirective]
})
export class ColumnsBlockComponent extends BaseBlockComponent<ColumnsBlockModel> {

  override applyReadonlyViewState() {
    super.applyReadonlyViewState()
    this.applyColumnWidths()
    this.changeDetectorRef.markForCheck()
  }

  /**
   * 生成分割线数组（列数-1）
   */
  protected get dividerArray(): number[] {
    const count = this.childrenLength;
    if (!count || count < 2) return [];
    return Array(count - 1).fill(0).map((_, i) => i);
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    // 延迟初始化，确保 DOM 完全渲染
    setTimeout(() => {
      this.applyColumnWidths();
      this.changeDetectorRef.markForCheck();
    }, 0);
  }

  override onChildrenChange = (events: any) => {
    this.applyColumnWidths();
    this.changeDetectorRef.markForCheck();
  }

  /**
   * 应用列宽样式（使用 CSS 变量）
   */
  private applyColumnWidths() {
    const actualColumnCount = this.childrenLength;
    if (actualColumnCount === 0) return;

    let widths = this.props.columnWidths || [];

    // 如果没有初始化宽度，或宽度数量与实际列数不匹配，使用平均分配
    if (widths.length === 0 || widths.length !== actualColumnCount) {
      const avgWidth = parseFloat((100 / actualColumnCount).toFixed(2));
      widths = Array(actualColumnCount).fill(avgWidth);
      if (!this.doc.isReadonly) {
        this.doc.crud.transact(() => {
          this.updateProps({
            columnCount: actualColumnCount,
            columnWidths: widths
          })
        }, ORIGIN_SYSTEM_REPAIR)
      }
    }

    // 设置 CSS 变量
    const wrapper = this.hostElement.querySelector('.columns-wrapper') as HTMLElement;
    if (wrapper) {
      widths.forEach((width, index) => {
        wrapper.style.setProperty(`--column-width-${index}`, `${width}%`);
      });
    }
  }

  /**
   * 增加一列
   */
  addColumn(event: MouseEvent, index = this.childrenLength) {
    event.preventDefault();
    if (this.isReadonly) return;
    if (this.childrenLength >= 8) {
      this.doc.messageService.warn('最多支持8列');
      return
    }

    // 创建新的 column-block
    const newColumn = ColumnBlockSchema.createSnapshot();

    // 添加新列
    this.doc.crud.insertBlocks(this.id, index, [newColumn]);

    // 注意：不需要手动更新 columnCount 和 columnWidths
    // onChildrenChange 会自动触发并重新计算
  }

  /**
   * 删除最后一列
   */
  removeColumn(event: MouseEvent, index = this.childrenLength - 1) {
    event.preventDefault();
    if (this.isReadonly) return;
    if (index <= 2 || index >= this.childrenLength) return;

    // 获取最后一个column-block并删除
    const lastColumnId = this.childrenIds[index];
    if (lastColumnId) {
      this.doc.crud.deleteBlockById(lastColumnId);
    }
  }

  /**
   * 开始拖拽调整列宽
   */
  startResize(event: MouseEvent, dividerIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    if (this.isReadonly) return;

    const startX = event.clientX;
    const wrapper = this.hostElement.querySelector('.columns-wrapper') as HTMLElement;
    const wrapperWidth = wrapper.getBoundingClientRect().width;
    const widths = [...this.props.columnWidths];
    const leftWidth = widths[dividerIndex];
    const rightWidth = widths[dividerIndex + 1];

    // 性能优化：在 zone 外执行
    this.doc.ngZone.runOutsideAngular(() => {
      const onMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / wrapperWidth) * 100;

        // 计算新宽度（限制最小宽度为 10%）
        let newLeftWidth = leftWidth + deltaPercent;
        let newRightWidth = rightWidth - deltaPercent;

        // 限制最小宽度
        const minWidth = 10;
        if (newLeftWidth < minWidth) {
          newLeftWidth = minWidth;
          newRightWidth = leftWidth + rightWidth - minWidth;
        } else if (newRightWidth < minWidth) {
          newRightWidth = minWidth;
          newLeftWidth = leftWidth + rightWidth - minWidth;
        }

        // 实时更新 CSS 变量
        wrapper.style.setProperty(`--column-width-${dividerIndex}`, `${newLeftWidth}%`);
        wrapper.style.setProperty(`--column-width-${dividerIndex + 1}`, `${newRightWidth}%`);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // 保存到数据模型
        this.doc.ngZone.run(() => {
          if (this.isReadonly) return
          const newWidths = [...widths];

          // 从 CSS 变量读取最终宽度（保留两位小数）
          const leftWidth = wrapper.style.getPropertyValue(`--column-width-${dividerIndex}`);
          const rightWidth = wrapper.style.getPropertyValue(`--column-width-${dividerIndex + 1}`);

          newWidths[dividerIndex] = parseFloat(parseFloat(leftWidth).toFixed(2));
          newWidths[dividerIndex + 1] = parseFloat(parseFloat(rightWidth).toFixed(2));

          this.updateProps({ columnWidths: newWidths });
          this.changeDetectorRef.markForCheck();
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
