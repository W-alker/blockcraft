import { ChangeDetectionStrategy, Component, ComponentRef } from "@angular/core";
import { BaseBlockComponent, BlockReadonlyOperation, getPositionWithOffset, ORIGIN_SYSTEM_REPAIR } from "../../framework";
import { ColumnsBlockModel, ColumnBlockSchema } from "./index";
import { OverlayRef } from '@angular/cdk/overlay';
import { Subject, fromEvent, takeUntil } from 'rxjs';
import { ColumnsToolbarComponent } from './columns-toolbar.component';

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
            <div class="divider-line"></div>
          </div>
        }
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'syncColumnToolbar()',
  },
})
export class ColumnsBlockComponent extends BaseBlockComponent<ColumnsBlockModel> {

  private toolbar?: {overlayRef: OverlayRef; componentRef: ComponentRef<ColumnsToolbarComponent>};
  private readonly toolbarClose$ = new Subject<void>();
  private activeColumnId?: string;
  private toolbarPositionFrame?: number;

  protected syncColumnToolbar() {
    const selection = this.doc.selection.value;
    let id = selection?.head.blockId;
    // 依据模型选区定位直属子栏，兼容键盘移动和子栏内的嵌套块。
    while (id && this.doc.model.exists(id)) {
      const parentId = this.doc.model.getParentId(id);
      if (parentId === this.id) break;
      id = parentId ?? undefined;
    }
    const column = id && this.childrenIds.includes(id) ? this.doc.getBlockById(id) : null;
    if (!column || this.isReadonly || this.doc.dragController.state !== 'idle') {
      this.closeColumnToolbar();
      return;
    }
    if (this.toolbar && this.activeColumnId === column.id) {
      return;
    }
    this.closeColumnToolbar();
    this.activeColumnId = column.id;
    const toolbar = this.doc.overlayService.createConnectedOverlay<ColumnsToolbarComponent>({
      target: column,
      component: ColumnsToolbarComponent,
      positions: [getPositionWithOffset('top-center', 0, 8), getPositionWithOffset('bottom-center', 0, 8)],
      flexibleDimensions: false,
    }, this.toolbarClose$, () => {
      if (this.toolbarPositionFrame !== undefined) cancelAnimationFrame(this.toolbarPositionFrame);
      this.toolbarPositionFrame = undefined;
      this.toolbar = undefined;
      this.activeColumnId = undefined;
    });
    this.toolbar = toolbar;
    this.updateToolbarInputs();
    const component = toolbar.componentRef.instance;
    component.insert.pipe(takeUntil(this.toolbarClose$)).subscribe(side => {
      // 点击时按稳定子栏 ID 重查位置，避免协同插入后使用旧索引。
      const index = this.childrenIds.indexOf(this.activeColumnId!);
      if (index < 0) return this.closeColumnToolbar();
      this.insertColumn(index + (side === 'after' ? 1 : 0));
      this.updateToolbarInputs();
      this.positionToolbar();
    });
    component.dissolve.pipe(takeUntil(this.toolbarClose$)).subscribe(() => this.dissolveColumns());
    const owner = this.hostElement.ownerDocument;
    fromEvent<KeyboardEvent>(owner, 'keydown').pipe(takeUntil(this.toolbarClose$)).subscribe(event => {
      if (event.key === 'Escape') this.closeColumnToolbar();
    });
    fromEvent<MouseEvent>(owner, 'mousedown', {capture: true}).pipe(takeUntil(this.toolbarClose$)).subscribe(event => {
      const target = event.target as Node;
      if (!this.hostElement.contains(target) && !toolbar.overlayRef.overlayElement.contains(target)) this.closeColumnToolbar();
    });
    // 内层填写区也可能独立滚动；关闭离开可视位置的操作条。
    fromEvent(owner, 'scroll', {capture: true}).pipe(takeUntil(this.toolbarClose$)).subscribe(() => this.closeColumnToolbar());
  }

  private updateToolbarInputs() {
    this.toolbar?.componentRef.setInput('count', this.childrenLength);
    this.toolbar?.componentRef.setInput('index', this.childrenIds.indexOf(this.activeColumnId!));
    this.toolbar?.componentRef.setInput('canDissolve', this.canDissolveColumns());
  }

  private canDissolveColumns() {
    const parent = this.parentBlock;
    return !!parent && !this.isReadonly && !parent.isReadonly && !this.doc.readonlyManager.containsReadonly(this.id) &&
      this.childrenIds.every(id => this.doc.model.getChildrenIds(id).every(childId => {
        const node = this.doc.model.getYBlock(childId);
        return !!node && this.doc.schemas.isValidChildrenForInstance(node.get('flavour'), parent.flavour, parent.meta);
      }));
  }

  private dissolveColumns() {
    const parent = this.parentBlock;
    if (!parent || !this.canDissolveColumns()) return;
    const columns = this.childrenIds.map(id => ({id, children: this.doc.model.getChildrenIds(id)}));
    // Yjs 事务不提供异常回滚；先验证整组操作，避免只搬出部分内容。
    this.doc.readonlyManager.assertRemovable([this.id], BlockReadonlyOperation.Delete);
    this.doc.mutationPolicy?.assert({operation: 'delete', blockIds: [this.id], parentId: parent.id});
    for (const column of columns) {
      if (!column.children.length) continue;
      this.doc.readonlyManager.assertMovable(column.children, parent.id, BlockReadonlyOperation.Move);
      this.doc.mutationPolicy?.assert({operation: 'move', blockIds: [...column.children], parentId: column.id, targetId: parent.id});
    }
    const firstId = columns.flatMap(column => column.children)[0];
    const selection = this.doc.selection.value?.toJSON();
    let insertAt = this.getIndexOfParent();
    this.doc.crud.undoManager.stopCapturing();
    this.doc.crud.transact(() => {
      for (const column of columns) {
        this.doc.crud.moveBlocks(column.id, 0, column.children.length, parent.id, insertAt);
        insertAt += column.children.length;
      }
      if (!firstId && parent.childrenLength === 1) {
        this.doc.crud.insertBlocks(parent.id, insertAt++, [this.doc.schemas.createSnapshot('paragraph', [])]);
      }
      // 事务内模型索引尚未刷新，按搬移后的实时位置删除空分栏容器。
      this.doc.crud.deleteBlocks(parent.id, insertAt, 1);
    });
    this.doc.crud.undoManager.stopCapturing();
    this.closeColumnToolbar();
    if (selection && this.doc.model.exists(selection.anchor.blockId) && this.doc.model.exists(selection.head.blockId)) {
      this.doc.selection.replay(selection);
    } else if (firstId) this.doc.selection.selectOrSetCursorAtBlock(firstId, true);
  }

  private closeColumnToolbar() {
    this.toolbarClose$.next();
  }

  private positionToolbar() {
    if (this.toolbarPositionFrame !== undefined) return;
    this.toolbarPositionFrame = requestAnimationFrame(() => {
      this.toolbarPositionFrame = undefined;
      this.toolbar?.overlayRef.updatePosition();
    });
  }

  override ngOnDestroy() {
    this.closeColumnToolbar();
    this.toolbarClose$.complete();
    super.ngOnDestroy();
  }

  override applyReadonlyViewState() {
    super.applyReadonlyViewState()
    if (this.isReadonly) this.closeColumnToolbar()
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
    this.doc.selection.selectionChange$.pipe(takeUntil(this.onDestroy$)).subscribe(() => this.syncColumnToolbar());
    this.doc.dragController.state$.pipe(takeUntil(this.onDestroy$)).subscribe(state => {
      if (state !== 'idle') this.closeColumnToolbar();
    });
    this.doc.readonlyManager.stateChange$.pipe(takeUntil(this.onDestroy$)).subscribe(() => this.updateToolbarInputs());
    // 延迟初始化，确保 DOM 完全渲染
    setTimeout(() => {
      this.applyColumnWidths();
      this.changeDetectorRef.markForCheck();
    }, 0);
  }

  override onChildrenChange = (events: any) => {
    this.applyColumnWidths();
    if (this.activeColumnId && !this.childrenIds.includes(this.activeColumnId)) this.closeColumnToolbar();
    this.updateToolbarInputs();
    if (this.toolbar) this.positionToolbar();
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
    this.insertColumn(index);
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

    this.closeColumnToolbar();
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
