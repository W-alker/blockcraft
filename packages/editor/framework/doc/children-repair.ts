import { ORIGIN_SYSTEM_REPAIR } from "./crud";
import { isYArray } from "../utils/yAbstractType";

interface ICrossParentDuplicate {
  blockId: string
  parentIds: string[]
}

/**
 * 协同合并产生的 children 结构破损修复器。
 *
 * 三类破损都可能出现在 CRDT 结构事务合并或 Undo/Redo 回放之后：
 * 1. 同父重复：两端并发在同一父块内移动同一个块 → children 数组出现重复 ID
 *    （组件/DOM 只有一份，渲染引用与模型脱节）；
 * 2. 跨父重复：两端并发把同一个块移到不同父块 → 同一 ID 同时出现在两个父块
 *    的 children 里；
 * 3. 悬空引用：并发移动与删除合并，或撤销块创建后，children 仍引用已不存在的
 *    YBlock。
 *
 * 性能约定（务必维持）：
 * - 仅由远端结构事务或 Undo/Redo 触发修复，本地打字/普通结构操作不扫描；
 * - 首次需修复的结构事务冷建一次 O(blocks + edges) 归属索引，后续只增量
 *   更新受影响父块并检查本次插入/删除的 ID；普通输入和滚动不参与；
 * - 修复合并进一个微任务、单个 ORIGIN_SYSTEM_REPAIR 事务（不进 undo 栈，
 *   视图与远端正常同步）；
 * - 修复规则确定（同父保留首个出现，跨父保留 parentId 字典序较小者），
 *   两端各自执行删的是同一批 Yjs item，幂等收敛、不会 ping-pong。
 */
export class ChildrenRepairer {
  private _pendingParentIds = new Set<string>()
  private _pendingInsertedIds = new Set<string>()
  private _childrenByParentId = new Map<string, readonly string[]>()
  private _parentsByChildId = new Map<string, string | Set<string>>()
  private _ownershipIndexReady = false
  private _scheduled = false

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly settleOwnership?: (
      owners: ReadonlyMap<string, string>,
      affectedParentIds: ReadonlySet<string>,
    ) => void,
  ) {
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
    }, ORIGIN_SYSTEM_REPAIR)

    if (removed) {
      this.doc.logger.warn(`pruned ${removed} dangling child ref(s) encountered on load`)
    }
  }

  /**
   * Keep a model-only ownership projection current for structural transactions.
   * The first remote structure change pays one cold full-map build; later local,
   * remote and repair transactions update only their changed parents.
   *
   * Returns inserted IDs that currently have multiple raw parents so CRUD can
   * defer view ownership settlement until the deterministic repair completes.
   */
  noteStructureChanges(
    parentIds: Iterable<string>,
    insertedIds: Iterable<string>,
    deletedIds: Iterable<string>,
    shouldRepair: boolean,
  ): ReadonlySet<string> {
    const changedParents = new Set(parentIds)
    const candidates = new Set(insertedIds)
    const deleted = new Set(deletedIds)
    if (!changedParents.size && !candidates.size && !deleted.size) return new Set()

    if (!this._ownershipIndexReady) {
      if (!shouldRepair) return new Set()
      this._rebuildOwnershipIndex()
    } else {
      changedParents.forEach(parentId => this._reconcileParentProjection(parentId))
    }

    if (!shouldRepair) return new Set()
    // Deleting a YBlock does not necessarily mutate every raw parent array in
    // the same merged transaction. Use the ownership index to target only the
    // parents that can now contain a dangling reference.
    deleted.forEach(blockId => {
      this._ownerIds(blockId).forEach(parentId => changedParents.add(parentId))
    })
    changedParents.forEach(parentId => this._pendingParentIds.add(parentId))
    candidates.forEach(blockId => this._pendingInsertedIds.add(blockId))
    this._schedule()

    return new Set(
      [...candidates].filter(blockId => this._ownerCount(blockId) > 1),
    )
  }

  private _rebuildOwnershipIndex() {
    this._childrenByParentId.clear()
    this._parentsByChildId.clear()
    this.doc.yBlockMap.forEach((_block, parentId) => {
      this._reconcileParentProjection(parentId)
    })
    this._ownershipIndexReady = true
  }

  private _reconcileParentProjection(parentId: string) {
    const previous = this._childrenByParentId.get(parentId) ?? []
    new Set(previous).forEach(blockId => this._removeOwner(blockId, parentId))

    const next = this._rawChildIds(parentId)
    if (!next) {
      this._childrenByParentId.delete(parentId)
      return
    }
    this._childrenByParentId.set(parentId, next)
    new Set(next).forEach(blockId => this._addOwner(blockId, parentId))
  }

  private _addOwner(blockId: string, parentId: string) {
    const current = this._parentsByChildId.get(blockId)
    if (!current) {
      this._parentsByChildId.set(blockId, parentId)
      return
    }
    if (typeof current === 'string') {
      if (current !== parentId) {
        this._parentsByChildId.set(blockId, new Set([current, parentId]))
      }
      return
    }
    current.add(parentId)
  }

  private _removeOwner(blockId: string, parentId: string) {
    const current = this._parentsByChildId.get(blockId)
    if (!current) return
    if (typeof current === 'string') {
      if (current === parentId) this._parentsByChildId.delete(blockId)
      return
    }
    current.delete(parentId)
    if (!current.size) {
      this._parentsByChildId.delete(blockId)
    } else if (current.size === 1) {
      this._parentsByChildId.set(blockId, current.values().next().value!)
    }
  }

  private _ownerIds(blockId: string): string[] {
    const owners = this._parentsByChildId.get(blockId)
    if (!owners) return []
    return typeof owners === 'string' ? [owners] : [...owners]
  }

  private _ownerCount(blockId: string): number {
    const owners = this._parentsByChildId.get(blockId)
    return typeof owners === 'string' ? 1 : (owners?.size ?? 0)
  }

  private _schedule() {
    if (this._scheduled) return
    if (!this._pendingParentIds.size && !this._pendingInsertedIds.size) return
    this._scheduled = true
    queueMicrotask(() => {
      this._scheduled = false
      const parentIds = this._pendingParentIds
      const insertedIds = this._pendingInsertedIds
      this._pendingParentIds = new Set()
      this._pendingInsertedIds = new Set()
      try {
        this._flush(parentIds, insertedIds)
      } catch (e) {
        this.doc.logger.warn('children repair failed', e)
      }
    })
  }

  private _rawChildIds(parentId: string): string[] | null {
    const yChildren = this.doc.yBlockMap.get(parentId)?.get('children')
    // editable 块的 children 是 Y.Text：返回 null 让所有预检/修复/DOM 复位
    // 都跳过该块。这个 isYArray 检测是 editable 安全性的唯一防线，不可移除。
    return yChildren && isYArray(yChildren) ? yChildren.toArray() : null
  }

  private _flush(parentIds: Set<string>, insertedIds: Set<string>) {
    if (!this.doc.isInitialized) return
    // 只读端是纯观察者：不写修复（updateProps 等写路径在只读下同样被禁），
    // 可编辑端修复后会广播过来，这里照常接收即可。
    if (this.doc.isReadonly) return
    // ── 预检（绝大多数远端事务到此为止）──
    const brokenParents: string[] = []
    for (const pid of parentIds) {
      const ids = this._rawChildIds(pid)
      if (!ids) continue
      if (
        new Set(ids).size !== ids.length ||
        ids.some(id => !this.doc.yBlockMap.has(id))
      ) {
        brokenParents.push(pid)
      }
    }

    const confirmedCross: ICrossParentDuplicate[] = []
    for (const blockId of insertedIds) {
      const owners = this._ownerIds(blockId)
        .filter(parentId => this._rawChildIds(parentId)?.includes(blockId))
        .sort()
      if (this.doc.yBlockMap.has(blockId) && owners.length > 1) {
        confirmedCross.push({blockId, parentIds: owners})
      }
    }

    if (!brokenParents.length && !confirmedCross.length) return

    // ── 修复（事务内重读最新状态；确定性规则，两端各自执行也收敛）──
    const settledOwners = new Map<string, string>()
    const repairedParentIds = new Set<string>()
    let fixedDuplicateParents = 0
    let fixedCrossParentIds = 0
    let fixedDanglingRefs = 0
    this.doc.crud.transact(() => {
      for (const pid of brokenParents) {
        const yChildren = this.doc.yBlockMap.get(pid)?.get('children')
        if (!yChildren || !isYArray(yChildren)) continue
        const ids = yChildren.toArray()
        const seen = new Set<string>()
        const removeIndexes: number[] = []
        let duplicateCount = 0
        let danglingCount = 0
        ids.forEach((id, i) => {
          if (!this.doc.yBlockMap.has(id)) {
            removeIndexes.push(i)
            danglingCount++
          } else if (seen.has(id)) {
            removeIndexes.push(i)
            duplicateCount++
            settledOwners.set(id, pid)
          } else {
            seen.add(id)
          }
        })
        // 重复项保留首个出现；悬空项全部删除。倒序执行，索引不漂移。
        for (let i = removeIndexes.length - 1; i >= 0; i--) {
          yChildren.delete(removeIndexes[i], 1)
        }
        if (removeIndexes.length) repairedParentIds.add(pid)
        if (duplicateCount) fixedDuplicateParents++
        fixedDanglingRefs += danglingCount
      }

      for (const duplicate of confirmedCross) {
        // 确定性仲裁：保留 parentId 字典序最小的父块（规则任意但全端一致）
        const keepParentId = duplicate.parentIds[0]
        let removed = false
        for (const dropParentId of duplicate.parentIds.slice(1)) {
          const yChildren = this.doc.yBlockMap.get(dropParentId)?.get('children')
          if (!yChildren || !isYArray(yChildren)) continue
          const ids = yChildren.toArray()
          for (let index = ids.length - 1; index >= 0; index--) {
            if (ids[index] !== duplicate.blockId) continue
            yChildren.delete(index, 1)
            removed = true
          }
        }
        if (!removed) continue
        fixedCrossParentIds++
        settledOwners.set(duplicate.blockId, keepParentId)
        duplicate.parentIds.forEach(parentId => repairedParentIds.add(parentId))
      }
    }, ORIGIN_SYSTEM_REPAIR)

    // The winning edge may have been skipped by BlockModelGraph while another
    // raw parent still owned the child. Its Y.Array does not change during the
    // repair transaction, so explicitly re-project that parent before creating
    // or moving any component view.
    settledOwners.forEach(parentId => {
      this.doc.model.synchronizeParentBeforeView(parentId)
    })

    // ── DOM 复位（纯本地操作，不产生 Yjs 写入）──
    this.settleOwnership?.(settledOwners, repairedParentIds)
    settledOwners.forEach((parentId, blockId) => this._realignChildDom(parentId, blockId))

    if (fixedDuplicateParents || fixedCrossParentIds || fixedDanglingRefs) {
      this.doc.logger.warn(
        `children repair: fixed ${fixedDuplicateParents} duplicated parent(s), ${fixedCrossParentIds} cross-parent duplicate(s), ${fixedDanglingRefs} dangling ref(s)`
      )
    }
  }

  private _realignChildDom(parentId: string, blockId: string) {
    const vm = this.doc.vm
    const parentComp = vm.get(parentId)
    const comp = vm.get(blockId)
    if (!parentComp || !comp) return
    const renderRef = parentComp.instance.childrenRenderRef
    if (!renderRef) return
    const idx = this._rawChildIds(parentId)?.indexOf(blockId) ?? -1
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
