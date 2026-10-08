import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent, ORIGIN_SYSTEM_REPAIR } from "../../framework";
import { ColumnsBlockModel, ColumnBlockSchema } from "./index";
import { CsTooltipDirective } from '@cses/ui';
import { takeUntil } from 'rxjs';

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
      @if (!isReadonly) {
        @for (columnId of dividerColumnIds; track columnId; let i = $index) {
          <div class="column-divider"
               [attr.data-divider-index]="i"
               (mousedown)="startResize($event, i)"
               contenteditable="false">
            @if (childrenLength < 8) {
              <button type="button" class="column-add-point"
                      [attr.aria-label]="'在第 ' + (i + 1) + ' 栏右侧插入栏'" csTooltip="插入栏"
                      data-bc-selection-interaction-ignore
                      (keydown)="$event.stopPropagation()"
                      (mousedown)="$event.preventDefault(); $event.stopPropagation()"
                      (click)="addColumnAfter($event, columnId)">
                <i class="bc_icon bc_plus" aria-hidden="true"></i>
              </button>
            }
            <div class="divider-line"></div>
          </div>
        }
        @if (childrenLength < 8) {
          <button type="button" class="column-add-point column-add-point--start"
                  aria-label="在最左侧插入栏" csTooltip="插入栏" contenteditable="false"
                  data-bc-selection-interaction-ignore
                  (keydown)="$event.stopPropagation()"
                  (mousedown)="$event.preventDefault(); $event.stopPropagation()"
                  (click)="addColumn($event, 0)">
            <i class="bc_icon bc_plus" aria-hidden="true"></i>
          </button>
          <button type="button" class="column-add-point column-add-point--end"
                  aria-label="在末尾插入栏" csTooltip="插入栏" contenteditable="false"
                  data-bc-selection-interaction-ignore
                  (keydown)="$event.stopPropagation()"
                  (mousedown)="$event.preventDefault(); $event.stopPropagation()"
                  (click)="addColumn($event)">
            <i class="bc_icon bc_plus" aria-hidden="true"></i>
          </button>
        }
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsTooltipDirective],
  host: {
    '[class.column-controls-dragging]': 'dragActive',
    '[class.column-controls-active]': 'columnFocused',
  },
})
export class ColumnsBlockComponent extends BaseBlockComponent<ColumnsBlockModel> {

  protected dragActive = false;
  protected columnFocused = false;

  protected addColumnAfter(event: MouseEvent, columnId: string) {
    // 按稳定子栏 ID 重查位置，避免协同插入后使用旧索引。
    const index = this.childrenIds.indexOf(columnId);
    if (index >= 0) this.addColumn(event, index + 1);
  }

  override applyReadonlyViewState() {
    super.applyReadonlyViewState()
    this.applyColumnWidths()
    this.changeDetectorRef.markForCheck()
  }

  /**
   * 生成栏间分割线的稳定子栏 ID（栏数-1）
   */
  protected get dividerColumnIds(): string[] {
    return this.childrenIds.slice(0, -1);
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.doc.selection.selectionChange$.pipe(takeUntil(this.onDestroy$)).subscribe(selection => {
      let id = selection?.head.blockId;
      while (id && id !== this.id && this.doc.model.exists(id)) id = this.doc.model.getParentId(id) ?? undefined;
      const focused = id === this.id;
      if (this.columnFocused === focused) return;
      this.columnFocused = focused;
      this.changeDetectorRef.markForCheck();
    });
    this.doc.dragController.state$.pipe(takeUntil(this.onDestroy$)).subscribe(state => {
      const active = state !== 'idle';
      if (this.dragActive === active) return;
      this.dragActive = active;
      this.changeDetectorRef.markForCheck();
    });
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
    event.stopPropagation();
    this.doc.crud.undoManager.stopCapturing();
    this.insertColumn(index);
    this.doc.crud.undoManager.stopCapturing();
  }

  private insertColumn(index: number) {
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
    if (index < 0 || index >= this.childrenLength) return;

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
