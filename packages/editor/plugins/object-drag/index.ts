import {Subscription, fromEvent, takeUntil} from 'rxjs'
import {DocPlugin, closetBlockId} from '../../framework'

/** 这些对象已有专属编辑/移动入口，通用拾取只补齐其余 placement 对象。 */
const SELF_MANAGED_DRAG_FLAVOURS = new Set(['image', 'shape', 'text-box', 'word-art', 'object-group'])

/** 按 placement 能力提供对象本体选择与浮动移动；不依赖宿主或物料注册表。 */
export class ObjectDragPlugin extends DocPlugin {
  override name = 'ObjectDrag'
  private readonly subscriptions = new Subscription()

  override init(): void {
    // 在 Selection 的根节点捕获处理之前拾取；专属对象与组合插件先注册。
    this.subscriptions.add(fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(event => this.onPointerDown(event)))
  }

  override destroy(): void {
    this.subscriptions.unsubscribe()
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.defaultPrevented || event.button !== 0 || this.doc.isReadonly) return
    if (this.doc.dragController.state !== 'idle' || this.doc.placement.state !== 'idle') return
    const target = event.target
    if (!(target instanceof Element) || !this.doc.root.hostElement.contains(target)) return
    // 手柄自管缩放，交互控件与 void 块前后的 gap 光标不能被本体移动接管。
    if (target.closest('block-resizer, [data-bc-placement-pick-ignore], [data-bc-nodrag], [data-block-zero-space="true"]')) return
    const blockId = closetBlockId(target)
    if (!blockId) return
    let block: BlockCraft.BlockComponent | null
    try { block = this.doc.getBlockById(blockId) } catch { return }
    if (!block || SELF_MANAGED_DRAG_FLAVOURS.has(block.flavour)) return
    if (!this.doc.placement.supports(block, 'absolute')) return

    // 原生选区会把自绘 void 块的点击落到旁边的 gap，必须显式选择本体。
    // 已选对象重新点击也要唤起对应工具条，保持原有宿主交互。
    const current = this.doc.selection.value
    if (current?.firstBlockId === block.id &&
      current.anchor.type === 'selected' && current.head.type === 'selected') {
      this.doc.selection.blur()
    }
    this.doc.selection.selectBlock(block)
    // 正文流仍由 BlockController 的手柄排序；组合成员使用局部 absolute 坐标。
    if (this.doc.readonlyManager.isReadonly(block) || this.doc.placement.getState(block).mode !== 'absolute') return
    this.doc.placement.startDrag(event, block)
  }
}
