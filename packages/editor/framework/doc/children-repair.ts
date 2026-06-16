import { ORIGIN_NO_RECORD } from "./crud";
import { isYArray } from "../utils/yAbstractType";

interface ICrossParentMove {
  blockId: string
  oldParentId: string
  newParentId: string
}

/**
 * 协同合并产生的 children 结构破损修复器。
 *
 * 两类破损都源于「move = delete + insert」在 CRDT 合并下两个 insert 双双保留：
 * 1. 同父重复：两端并发在同一父块内移动同一个块 → children 数组出现重复 ID
 *    （组件/DOM 只有一份，渲染引用与模型脱节）；
 * 2. 跨父重复：两端并发把同一个块移到不同父块 → 同一 ID 同时出现在两个父块
 *    的 children 里。
 *
 * 性能约定（务必维持）：
 * - 仅由远端事务触发，本地打字/本地结构操作零开销；
 * - 预检只做 O(children) 的 Set / includes 判断，绝不全文档扫描；
 * - 修复合并进一个微任务、单个 ORIGIN_NO_RECORD 事务（不进 undo 栈，
 *   视图与远端正常同步）；
 * - 修复规则确定（同父保留首个出现，跨父保留 parentId 字典序较小者），
 *   两端各自执行删的是同一批 Yjs item，幂等收敛、不会 ping-pong。
 */
export class ChildrenRepairer {
  private _pendingParentIds = new Set<string>()
  private _pendingCrossMoves: ICrossParentMove[] = []
  private _scheduled = false

  constructor(private readonly doc: BlockCraft.Doc) {
  }

  /**
   * 「遇到才兜底」剪除悬空 child 引用：只删 `refs` 里指定的那些（即初始加载构建
   * 组件树时 `createComponentByYBlocks` 实际遇到并跳过的悬空引用）。不做全文档扫描——
   * 干净文档零开销。
   *
   * 悬空引用成因：历史协同「并发移动 vs 删除」——一端把块移入新父（新父 children
   * 加引用）、另一端删块（删 yBlock），合并后引用存活而 yBlock 丢失。
   *
   * 【必须在构建组件树之后、observer 挂载之前调用】（见 initByYBlock）：
   * - 构建时悬空 child 被跳过渲染，`_compRefs` 比 Y.Array 短一项（长度错位）；
   *   此处剪掉 Y.Array 里的悬空引用，两者重新对齐；
   * - 此时 observer 未挂、undoManager 未建 → 删除不触发 `_syncYBlockChildrenUpdate`
   *   的按模型下标 splice（否则会 splice 到已错位的 `_compRefs`、删错有效组件），
   *   也不进 undo。
   *
   * 只读端不修复：此时 `readonlySwitch$` 尚未被 `_initEditor` 的 nextTick 赋值
   * （初值为 true），`isReadonly` 不可靠，必须用配置源 `config.readonly` 判定——
   * 只读端通常在协同服务端无写权限，绝不能广播修复事务（渲染端 skip 已能容错）。
   */
  pruneRefs(refs: ReadonlyArray<{ parentId: string, childId: string }>) {
    if (this.doc.config.readonly || !refs.length) return
    try {
      this._pruneRefs(refs)
    } catch (e) {
      // 兜底自身的任何异常都不允许阻断文档初始化
      this.doc.logger.warn('dangling ref prune failed', e)
    }
  }

  private _pruneRefs(refs: ReadonlyArray<{ parentId: string, childId: string }>) {
    const yBlockMap = this.doc.yBlockMap
    const byParent = new Map<string, Set<string>>()
    for (const { parentId, childId } of refs) {
      let dead = byParent.get(parentId)
      if (!dead) byParent.set(parentId, dead = new Set())
      dead.add(childId)
    }

    let removed = 0
    this.doc.crud.transact(() => {
      byParent.forEach((deadIds, parentId) => {
        const yChildren = yBlockMap.get(parentId)?.get('children')
        if (!yChildren || !isYArray(yChildren)) return
        const ids = yChildren.toArray() as string[]
        // 倒序删除，下标不漂移；再次校验「确实仍悬空」防御误删（构建到此处之间
        // 状态不应变化，但 yBlockMap.get 仍非空则跳过，绝不删有效引用）。
        for (let i = ids.length - 1; i >= 0; i--) {
          if (deadIds.has(ids[i]) && !yBlockMap.get(ids[i])) {
            yChildren.delete(i, 1)
            removed++
          }
        }
      })
    }, ORIGIN_NO_RECORD)

    if (removed) {
      this.doc.logger.warn(`pruned ${removed} dangling child ref(s) encountered on load`)
    }
  }

  /**
   * 远端 children insert 处理前调用。vm.insert 会改写组件的 parentId，
   * 所以「已存在且 parentId 不同」的组件必须在那之前抓取，作为疑似跨父移动。
   * 正常的远端移动（旧父块里已无此 ID）会在 flush 预检中被排除。
   */
  noteRemoteInserts(parentBm: BlockCraft.BlockComponentRef, comps: (BlockCraft.BlockComponentRef | undefined)[]) {
    // 边界：同一事务里同一块被插入 ≥3 个父块（三路并发移动的破损态）时，
    // 顺序处理只能两两配对，第三处重复留待下一轮远端事务触发时修复——
    // 修复是幂等的，多轮收敛，不会丢内容。
    const newParentId = parentBm.instance.id
    for (const comp of comps) {
      const oldParentId = comp?.instance.parentId
      if (!comp || !oldParentId || oldParentId === newParentId) continue
      this._pendingCrossMoves.push({ blockId: comp.instance.id, oldParentId, newParentId })
    }
    this._schedule()
  }

  /** 远端 children 变更涉及的父块，flush 时做同父重复预检。 */
  noteRemoteParents(parentIds: string[]) {
    for (const id of parentIds) this._pendingParentIds.add(id)
    this._schedule()
  }

  private _schedule() {
    if (this._scheduled) return
    if (!this._pendingParentIds.size && !this._pendingCrossMoves.length) return
    this._scheduled = true
    queueMicrotask(() => {
      this._scheduled = false
      const parentIds = this._pendingParentIds
      const crossMoves = this._pendingCrossMoves
      this._pendingParentIds = new Set()
      this._pendingCrossMoves = []
      try {
        this._flush(parentIds, crossMoves)
      } catch (e) {
        this.doc.logger.warn('children repair failed', e)
      }
    })
  }

  private _childIds(comp: BlockCraft.BlockComponentRef): string[] | null {
    const yChildren = comp.instance.yBlock.get('children')
    // editable 块的 children 是 Y.Text：返回 null 让所有预检/修复/DOM 复位
    // 都跳过该块。这个 isYArray 检测是 editable 安全性的唯一防线，不可移除。
    return isYArray(yChildren) ? yChildren.toArray() : null
  }

  private _flush(parentIds: Set<string>, crossMoves: ICrossParentMove[]) {
    if (!this.doc.isInitialized) return
    // 只读端是纯观察者：不写修复（updateProps 等写路径在只读下同样被禁），
    // 可编辑端修复后会广播过来，这里照常接收即可。
    if (this.doc.isReadonly) return
    const vm = this.doc.vm

    // ── 预检（绝大多数远端事务到此为止）──
    const dupParents: string[] = []
    for (const pid of parentIds) {
      const comp = vm.get(pid)
      if (!comp) continue
      const ids = this._childIds(comp)
      if (ids && new Set(ids).size !== ids.length) dupParents.push(pid)
    }

    const confirmedCross: ICrossParentMove[] = []
    for (const move of crossMoves) {
      const oldParent = vm.get(move.oldParentId)
      const newParent = vm.get(move.newParentId)
      if (!oldParent || !newParent) continue
      if (!this._childIds(oldParent)?.includes(move.blockId)) continue // 正常移动：旧父已不含
      if (!this._childIds(newParent)?.includes(move.blockId)) continue
      confirmedCross.push(move)
    }

    if (!dupParents.length && !confirmedCross.length) return

    // ── 修复（事务内重读最新状态；确定性规则，两端各自执行也收敛）──
    const realigns: { parentId: string, blockId: string }[] = []
    this.doc.crud.transact(() => {
      for (const pid of dupParents) {
        const comp = vm.get(pid)
        if (!comp) continue
        const yChildren = comp.instance.yBlock.get('children')
        if (!isYArray(yChildren)) continue
        const ids = yChildren.toArray()
        const seen = new Set<string>()
        const dupIndexes: number[] = []
        ids.forEach((id, i) => {
          if (seen.has(id)) dupIndexes.push(i)
          else seen.add(id)
        })
        // 保留首个出现；从后往前删，索引不漂移
        for (let i = dupIndexes.length - 1; i >= 0; i--) {
          yChildren.delete(dupIndexes[i], 1)
          realigns.push({ parentId: pid, blockId: ids[dupIndexes[i]] })
        }
      }

      for (const move of confirmedCross) {
        // 确定性仲裁：保留 parentId 字典序较小的父块（规则任意但全端一致）
        const keepParentId = move.oldParentId < move.newParentId ? move.oldParentId : move.newParentId
        const dropParentId = keepParentId === move.oldParentId ? move.newParentId : move.oldParentId
        const dropParent = vm.get(dropParentId)
        if (!dropParent) continue
        const yChildren = dropParent.instance.yBlock.get('children')
        if (!isYArray(yChildren)) continue
        const idx = yChildren.toArray().indexOf(move.blockId)
        if (idx >= 0) {
          yChildren.delete(idx, 1)
          realigns.push({ parentId: keepParentId, blockId: move.blockId })
        }
      }
    }, ORIGIN_NO_RECORD)

    // ── DOM 复位（纯本地操作，不产生 Yjs 写入）──
    // 修复事务的 children 事件已同步处理完、_compRefs 与模型一致；但 DOM 节点
    // 物理上停在「最后一次 vm.insert」的位置，按模型索引归位。
    for (const r of realigns) this._realignChildDom(r.parentId, r.blockId)

    this.doc.logger.warn(
      `children repair: fixed ${dupParents.length} duplicated parent(s), ${confirmedCross.length} cross-parent duplicate(s)`
    )
  }

  private _realignChildDom(parentId: string, blockId: string) {
    const vm = this.doc.vm
    const parentComp = vm.get(parentId)
    const comp = vm.get(blockId)
    if (!parentComp || !comp) return
    const renderRef = parentComp.instance.childrenRenderRef
    if (!renderRef) return
    const idx = this._childIds(parentComp)?.indexOf(blockId) ?? -1
    if (idx < 0) return
    comp.instance.parentId = parentId
    const host = comp.instance.hostElement
    if (idx === 0) {
      renderRef.containerElement.prepend(host)
      return
    }
    const prev = renderRef.get(idx - 1)
    if (prev && prev.instance !== comp.instance) {
      prev.instance.hostElement.after(host)
    }
  }
}
