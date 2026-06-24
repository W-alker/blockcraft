import {ConnectedPosition} from "@angular/cdk/overlay";
import {POSITION_MAP} from "../../framework";

/**
 * 计算浮动文字工具栏的连接定位（connectElement + connectPositions）。
 *
 * 由 FloatTextToolbarPlugin 与 TextMarkerPlugin 共用，确保两个浮动工具栏定位行为
 * 一致：
 *  - 逐行 client rect（getSelectionRects），而非整体 bounding box —— 多行选区不会
 *    把工具栏推得过远；
 *  - 默认放选区**上方**（8px 间隙），上方空间不足时才落到下方，并按 scrollContainer
 *    边界做空间判定（canTop / canBottom）—— 避免在代码块等高块里遮挡内容；
 *  - 按选区中点相对 scrollContainer 的左右半区选锚点，并提供另一侧作为 CDK withPush
 *    的横向 fallback。
 *
 * @param toolbarHeight 工具栏估算高度，仅用于上下空间判定（默认 48）
 */
export function calcFloatToolbarPosition(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection,
  toolbarHeight = 48,
): { connectElement: HTMLElement; connectPositions: ConnectedPosition[] } {
  // 光标是向前还是向后
  const isForward = selection.getDirection() === 'forward';
  const relativeBlock = isForward ? selection.lastBlock : selection.firstBlock;

  let rect: DOMRect;
  if (relativeBlock.nodeType !== 'editable') {
    rect = relativeBlock.hostElement.getBoundingClientRect();
  } else {
    const selRect = doc.selection.getSelectionRects()!;
    rect = selection.isInSameBlock ? selRect[0] : (isForward ? selRect[selRect.length - 1] : selRect[0]);
  }
  const blockRect = relativeBlock.hostElement.getBoundingClientRect();
  const containerRect = doc.scrollContainer!.getBoundingClientRect();

  const TOOLBAR_H = toolbarHeight; // 估算工具栏高度（仅用于空间判定）
  const TOP_GAP = 8;      // 选区上方间隙
  const BOTTOM_GAP = 8;   // 选区下方间隙
  const SAFE_PAD = 8;     // 距 scrollContainer 边缘的安全间距

  // 垂直锚点：默认放上方；上方空间不够时改为下方（跨块且向前优先下方）
  const canTop = rect.top - (TOOLBAR_H + TOP_GAP) >= containerRect.top + SAFE_PAD;
  const canBottom = rect.bottom + TOOLBAR_H + BOTTOM_GAP <= containerRect.bottom - SAFE_PAD;
  const preferBottom = !selection.isInSameBlock && isForward;
  let relativeYPos: 'top' | 'bottom';
  if (preferBottom) {
    relativeYPos = canBottom ? 'bottom' : (canTop ? 'top' : 'bottom');
  } else {
    relativeYPos = canTop ? 'top' : (canBottom ? 'bottom' : 'top');
  }

  // 水平锚点：按选区相对 scrollContainer 的位置选锚点，不依赖工具栏宽度估算
  //   选区中点在容器右半 → right 锚（overlay.right = rect.right，向左展开）
  //   选区中点在容器左半 → left 锚（overlay.left = rect.left，向右展开）
  const selCenterX = (rect.left + rect.right) / 2;
  const containerCenterX = (containerRect.left + containerRect.right) / 2;
  const relativeXPos: 'left' | 'right' = selCenterX > containerCenterX ? 'right' : 'left';
  const fallbackXPos: 'left' | 'right' = relativeXPos === 'left' ? 'right' : 'left';

  // top-*: originY=top, overlayY=bottom → overlay.bottom = blockRect.top + offsetY；want overlay.bottom = rect.top - TOP_GAP
  // bottom-*: originY=bottom, overlayY=top → overlay.top = blockRect.bottom + offsetY；want overlay.top = rect.bottom + BOTTOM_GAP
  const offsetY = relativeYPos === 'top'
    ? (rect.top - TOP_GAP) - blockRect.top
    : (rect.bottom + BOTTOM_GAP) - blockRect.bottom;
  // *-left: overlay.left = blockRect.left + offsetX；want overlay.left = rect.left
  // *-right: overlay.right = blockRect.right + offsetX；want overlay.right = rect.right
  const offsetForX = (x: 'left' | 'right') =>
    x === 'left' ? rect.left - blockRect.left : rect.right - blockRect.right;

  // 主位置 + 横向 fallback（让 CDK withPush 在主位置溢出时切到另一侧）
  return {
    connectElement: relativeBlock.hostElement,
    connectPositions: [
      // @ts-ignore
      { ...POSITION_MAP[`${relativeYPos}-${relativeXPos}`], offsetX: offsetForX(relativeXPos), offsetY },
      // @ts-ignore
      { ...POSITION_MAP[`${relativeYPos}-${fallbackXPos}`], offsetX: offsetForX(fallbackXPos), offsetY },
    ],
  };
}
