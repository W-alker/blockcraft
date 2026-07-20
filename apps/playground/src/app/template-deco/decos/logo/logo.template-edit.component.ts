import { ChangeDetectionStrategy, Component, NgZone, inject } from '@angular/core'
import { DocFileService, DOC_FILE_SERVICE_TOKEN, ResizeContainerComponent } from '@ccc/blockcraft'
import { pickImageAsDataURL } from '../_shared/image-pick'
import { storeResizedWidth, pageColumnContentWidth, closestPageColumn } from '../_shared/page-size'
import { PlaceableEditBase } from '../_shared/placeable-edit.base'
import type { LogoModel } from './logo.deco'

// 三态排版 host 绑定 + 选中/拖拽接线都继承自 PlaceableEditBase（void 物料默认可拖），这里只写 logo 自己的东西
@Component({
  selector: 'div.template-logo-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResizeContainerComponent],
  // 空态：彩色图标 + 「选择图片」的虚线卡片（重设计）；有图：显图 + block-resizer 拖拽缩放
  template: `
    @if (!props.src) {
      <!-- data-deco-nodrag：纯点击控件放行标记——基类 host 拖拽的 preventDefault 会吞掉 click（见 PlaceableEditBase） -->
      <span class="tpl-img-hint" contenteditable="false" data-deco-nodrag (click)="pick()">
        <svg class="tpl-img-hint__icon" aria-hidden="true"><use [attr.xlink:href]="'#bc_tupian-color'"></use></svg>
        <span>选择图片</span>
      </span>
    } @else {
      <span class="tpl-img-wrap" contenteditable="false" #wrap>
        <img class="tpl-img" [src]="props.src" draggable="false" />
        <!-- [container] 绑 wrap（不是 host、也不是 img）：
             ① hover 域 = container.parentElement——wrap 的父正是本物料 host，手柄只在悬停本块时出现
               （绑 host 会外溢成整个 children 容器：独占常亮 + 多物料互相点亮；悬浮则是 0 高 layout 看运气）；
             ② 缩放预览改的是 wrap 宽——img width:100% 跟随、手柄 inset:0 贴 wrap 边，拖动时**实时跟手**
               （上一版绑 img：预览只改 img，手柄钉在不动的 wrap 边上，看起来"没在放大缩小"）。
             结束时清 wrap 内联宽，交还 host 的 width% 绑定（见 onResizeEnd） -->
        <block-resizer [container]="wrap" [maxWidthContainer]="columnEl" (resizeStart)="onResizeStart(wrap)" (resizeEnd)="onResizeEnd(wrap)" (widthChange)="onResized($event)" />
      </span>
    }
  `,
})
export class LogoTemplateEditComponent extends PlaceableEditBase<LogoModel> {
  private readonly zone = inject(NgZone)
  private get fileService() {
    return this.doc.injector.get<DocFileService>(DOC_FILE_SERVICE_TOKEN)
  }
  async pick(): Promise<void> {
    // data URL：选完即可显，且能随 snapshot 复制到使用态（详见 image-pick.ts）
    const src = await pickImageAsDataURL(this.fileService)
    if (!src) return
    this.updateProps({ src })                  // 用户显式交互走 updateProps 进 undo（setInitProps 只给建块初始化，Ctrl+Z 撤不掉）
    this.changeDetectorRef.markForCheck()      // OnPush：从空态切到 <img> 需手动触发
  }
  // 拖拽 emit px → 存页宽%（换算/度量收进共享 storeResizedWidth，各可缩放块共用）
  // 已自由定位(有 x)时宽度上限 = 100-x%：框架 resizer 不感知 left 偏移，缩放会把右缘拉出定位父，在提交这步兜住
  onResized(px: number): void { storeResizedWidth(this, px, this.props.x != null ? 100 - this.props.x : undefined) }

  /** 缩放预览的宽度镜像：resizer 逐帧写 wrap 的内联宽，这里实时抄给 host（见 onResizeStart 注释）。 */
  private mirrorMo: MutationObserver | null = null

  onResizeStart(wrap: HTMLElement): void {
    // 已自由定位(有 x)：给 host 挂 max-width = 左缘到定位父右缘的可用宽(px)，实时预览不越右缘（同 100-x 上限）
    if (this.props.x != null) {
      const avail = pageColumnContentWidth(this.hostElement) * (1 - this.props.x / 100)
      this.hostElement.style.maxWidth = `${Math.max(0, avail)}px`
    }
    // 预览镜像：resizer 只改 wrap 的内联宽，而 host 的 width%（Angular 绑定）要到提交才更新——
    // 选中框贴的是 host、环绕文字绕的也是 host，不镜像的话拖动期间「框只变高不变宽、文字不重排」。
    // 用 MutationObserver 盯 wrap 的 style：事件驱动、零轮询，resizer 每写一次宽就抄给 host 一次。
    // zone 外挂：回调只抄一条内联样式、不碰 Angular 状态，拖动期高频 mutation 不该逐帧触发变更检测
    // （对齐 underlay-pick.directive 对高频交互监听的处理方式）。
    this.zone.runOutsideAngular(() => {
      this.mirrorMo = new MutationObserver(() => { this.hostElement.style.width = wrap.style.width })
      this.mirrorMo.observe(wrap, { attributes: true, attributeFilter: ['style'] })
    })
  }

  // 结束：停镜像、清 wrap 预览宽和 host 的 maxWidth；host 宽**按 props 恢复而不是清空**——
  // host 的宽原本是 Angular 绑定写的内联样式，绑定只在值变化时重写，直接清空会在"没拖动就松手"时把宽度丢掉
  onResizeEnd(wrap: HTMLElement): void {
    this.mirrorMo?.disconnect()
    this.mirrorMo = null
    this.hostElement.style.maxWidth = ''
    wrap.style.width = ''
    this.hostElement.style.width = this.props.width != null ? `${this.props.width}%` : ''
  }
  /**
   * 泄漏兜底：拖拽缩放**进行中**组件被销毁（如撤销恰好删掉本块）时，框架 resize-container 的
   * ngOnDestroy 只退订 mousemove、不会补发 resizeEnd（resize-container.ts:129），onResizeEnd
   * 永远不执行——观察器就永远开着。资源要在所有退出路径上成对释放，不能只挂"正常结束"那条路。
   */
  override ngOnDestroy(): void {
    this.mirrorMo?.disconnect()
    this.mirrorMo = null
    super.ngOnDestroy()
  }
  // resizer 的 max 宽参照整列：host 已 absolute，拿 host 当参照会把「最大」卡在当前宽（放不大）
  protected get columnEl(): HTMLElement { return closestPageColumn(this.hostElement) ?? this.hostElement }
}
