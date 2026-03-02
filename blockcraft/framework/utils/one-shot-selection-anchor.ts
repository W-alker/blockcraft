import * as Y from "yjs";
import {EditableBlockComponent} from "../block-std";

/**
 * 文本光标点（单点）：
 * - `block`：目标可编辑块
 * - `index`：块内字符偏移
 */
export type ITextCursorPoint = {
  block: EditableBlockComponent
  index: number
}

/**
 * 文本范围点（区间）：
 * - `block`：目标可编辑块
 * - `index`：起始偏移
 * - `length`：选区长度
 */
export type ITextRangePoint = {
  block: EditableBlockComponent
  index: number
  length: number
}

/**
 * 内部使用的“相对锚点”结构。
 *
 * 为什么不直接存绝对 index：
 * - 协同编辑场景下，远端用户可能在当前光标前插入/删除文本；
 * - 绝对 index 会漂移，而 Yjs 的 RelativePosition 会随着文档变更映射到新位置。
 */
type IRelativeTextPoint = {
  blockId: string
  position: Y.RelativePosition
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * 将内部相对锚点解析为“当前时刻”的绝对光标点。
 *
 * 解析失败返回 null，常见原因：
 * - 锚点对应 block 已被删除；
 * - block 不再是可编辑块；
 * - 相对位置无法映射（例如结构变化导致 type 不匹配）。
 */
const resolveRelativePoint = (doc: BlockCraft.Doc, point: IRelativeTextPoint | null): ITextCursorPoint | null => {
  if (!point) return null

  let block: BlockCraft.BlockComponent
  try {
    block = doc.getBlockById(point.blockId)
  } catch {
    return null
  }

  if (!doc.isEditable(block)) return null

  const absolutePos = Y.createAbsolutePositionFromRelativePosition(point.position, doc.yDoc)
  if (!absolutePos || absolutePos.type !== block.yText) return null

  return {
    block,
    index: clamp(absolutePos.index, 0, block.textLength)
  }
}

/**
 * 一次性光标锚点（单点版本）。
 *
 * 典型使用场景：
 * 1. 现在 capture 当前光标；
 * 2. 执行异步流程（弹窗、网络请求、协同变更、下一帧回调）；
 * 3. 之后 resolve/consume 恢复“语义上同一个位置”。
 *
 * `consume` 是一次性语义：
 * - 取出并自动清空，避免旧锚点在后续流程被误用。
 */
export class OneShotCursorAnchor {
  private _point: IRelativeTextPoint | null = null

  constructor(private readonly doc: BlockCraft.Doc) {
  }

  /**
   * 手动清空内部锚点。
   * 通常在流程结束、取消或异常分支中调用。
   */
  reset() {
    this._point = null
  }

  /**
   * 从明确的 block + index 创建锚点。
   * index 会被 clamp 到合法范围，避免越界写入锚点。
   */
  capture(block: EditableBlockComponent, index: number) {
    const safeIndex = clamp(index, 0, block.textLength)
    this._point = {
      blockId: block.id,
      position: Y.createRelativePositionFromTypeIndex(block.yText, safeIndex)
    }
  }

  /**
   * 基于当前 selection 捕获锚点。
   *
   * 返回值：
   * - true：捕获成功
   * - false：当前 selection 不是 text（例如 block 选中）
   *
   * `options` 会透传给 `selection.recalculate`，
   * 如 IME 场景可传 `{ isComposing: true }`。
   */
  captureFromSelection(options?: { isComposing?: boolean }) {
    const {value: sel} = this.doc.selection.recalculate(false, options)
    if (!sel || sel.from.type !== 'text') {
      this._point = null
      return false
    }
    this.capture(sel.from.block, sel.from.index)
    return true
  }

  /**
   * 基于 StaticRange 捕获锚点。
   * 常用于 `beforeinput.getTargetRanges()`。
   */
  captureFromStaticRange(range: StaticRange, options?: { isComposing?: boolean }) {
    const sel = this.doc.selection.normalizeRange(range, options)
    if (sel.from.type !== 'text') {
      return false
    }
    this.capture(sel.from.block, sel.from.index)
    return true
  }

  /**
   * 基于 InputEvent 捕获锚点。
   *
   * 默认处理 `insertCompositionText`（IME 更新阶段）。
   * 也可通过 `options.inputType` 复用到其他 inputType。
   *
   * 注意：
   * - 内部会吃掉 transient 阶段的 normalize 异常并返回 false，
   *   避免在浏览器组合输入抖动阶段中断主流程。
   */
  captureFromInputEvent(
    ev: InputEvent,
    options?: { isComposing?: boolean; inputType?: string }
  ) {
    const inputType = options?.inputType || 'insertCompositionText'
    if (ev.inputType !== inputType || !ev.getTargetRanges) return false
    const staticRange = ev.getTargetRanges()[0]
    if (!staticRange) return false
    try {
      return this.captureFromStaticRange(staticRange, options)
    } catch {
      return false
    }
  }

  /**
   * 解析锚点，不清空内部状态。
   *
   * 如果锚点解析失败，会返回 fallback（若提供），否则返回 null。
   */
  resolve(fallback?: ITextCursorPoint | null) {
    return resolveRelativePoint(this.doc, this._point) || fallback || null
  }

  /**
   * 一次性读取：先 resolve，再 reset。
   * 适合“只触发一次”的异步提交动作。
   */
  consume(fallback?: ITextCursorPoint | null) {
    const point = this.resolve(fallback)
    this.reset()
    return point
  }
}

/**
 * 一次性范围锚点（起点 + 终点）。
 *
 * 设计约束：
 * - 当前实现仅在“解析后仍位于同一 EditableBlock”时返回有效范围；
 * - 如果协同变更导致跨块或任一点失效，返回 fallback/null。
 *
 * 该策略更保守，能避免在结构变化后把范围错误地应用到错误块。
 */
export class OneShotRangeAnchor {
  private _start: IRelativeTextPoint | null = null
  private _end: IRelativeTextPoint | null = null

  constructor(private readonly doc: BlockCraft.Doc) {
  }

  /**
   * 清空区间锚点（起点 + 终点）。
   */
  reset() {
    this._start = this._end = null
  }

  /**
   * 从 block + index + length 捕获区间。
   * start/end 会分别 clamp，确保锚点合法。
   */
  capture(block: EditableBlockComponent, index: number, length = 0) {
    const start = clamp(index, 0, block.textLength)
    const end = clamp(index + length, 0, block.textLength)
    this._start = {
      blockId: block.id,
      position: Y.createRelativePositionFromTypeIndex(block.yText, start)
    }
    this._end = {
      blockId: block.id,
      position: Y.createRelativePositionFromTypeIndex(block.yText, end)
    }
  }

  /**
   * 基于当前 selection 捕获区间。
   *
   * 行为说明：
   * - collapsed/单端场景：按 from.index + from.length；
   * - 双端 text 场景：归一化为 [min, max]；
   * - 非 text 或跨块 text：返回 false 并 reset。
   */
  captureFromSelection(options?: { isComposing?: boolean }) {
    const {value: sel} = this.doc.selection.recalculate(false, options)
    if (!sel || sel.from.type !== 'text') {
      this.reset()
      return false
    }

    if (!sel.to) {
      this.capture(sel.from.block, sel.from.index, sel.from.length)
      return true
    }

    if (sel.to.type !== 'text' || sel.to.blockId !== sel.from.blockId) {
      this.reset()
      return false
    }

    const start = Math.min(sel.from.index, sel.to.index)
    const end = Math.max(sel.from.index + sel.from.length, sel.to.index + sel.to.length)
    this.capture(sel.from.block, start, end - start)
    return true
  }

  /**
   * 解析区间，不清空状态。
   *
   * 失败回退条件：
   * - 任一点解析失败；
   * - 两点落在不同 block。
   */
  resolve(fallback?: ITextRangePoint | null): ITextRangePoint | null {
    const startPoint = resolveRelativePoint(this.doc, this._start)
    const endPoint = resolveRelativePoint(this.doc, this._end)

    if (!startPoint || !endPoint || startPoint.block !== endPoint.block) {
      return fallback || null
    }

    const start = Math.min(startPoint.index, endPoint.index)
    const end = Math.max(startPoint.index, endPoint.index)
    return {
      block: startPoint.block,
      index: start,
      length: end - start
    }
  }

  /**
   * 一次性读取区间：resolve + reset。
   */
  consume(fallback?: ITextRangePoint | null): ITextRangePoint | null {
    const range = this.resolve(fallback)
    this.reset()
    return range
  }
}
