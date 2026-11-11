import { take, takeUntil } from "rxjs";
import { ORIGIN_SYSTEM_REPAIR } from "../../framework";
import type { TableBlockComponent } from "./table.block";

/**
 * 表格协同 normalize：远端结构事务到达后，校验并修复
 * 1. 矩形不变量 —— 所有行的 cell 数一致（并发「加行 × 加列」合并后新行会缺格）；
 * 2. colWidths 长度 —— 与真实列数一致（colWidths 是整数组 prop，按 LWW 合并，
 *    并发增删列时必丢一端更新，与 cells 的 CRDT 合并结果脱节）。
 *
 * 性能约定（务必维持）：
 * - 仅订阅远端事务（e.local 过滤），本地编辑零额外开销；
 * - 触发后先做 O(rows) 预检（行长全等 + colWidths 长度比对），一致即返回——
 *   绝大多数远端事务到此为止；
 * - 修复合批进微任务，单 transact + ORIGIN_SYSTEM_REPAIR（不进 undo 栈，视图与
 *   远端正常同步）；
 * - 目标列数取「多数行长度」（并列取较小）；裁剪只删「空且未参与合并」的尾格，
 *   否则放大目标改为补齐其他行——内容永不丢失。两端基于同一合并态算出同一
 *   结果，双端同时修复也会在下一轮收敛（多补的空尾格会被对称裁掉）；
 * - 循环熔断：5 秒内超过 3 轮修复则本轮放弃并告警，等待下次远端事务再试。
 *
 * 注意：本模块只修「数量级」破损；合并单元格的 display/rowspan/colspan 一致性
 * 由 fixTable()（手动/深修复路径）负责，不在自动路径上做全矩阵扫描。
 */
export function attachTableNormalizer(table: TableBlockComponent): void {
  const doc = table.doc
  let pending = false
  let destroyed = false
  const repairTimes: number[] = []

  // takeUntil 只负责取消订阅；已调度的 queueMicrotask 可能在销毁后才执行，
  // destroyed 标志覆盖这个析构窗口，两套守卫缺一不可
  table.onDestroy$.pipe(take(1)).subscribe(() => destroyed = true)

  const isCellTrimmable = (cell: BlockCraft.BlockComponent | null | undefined): boolean => {
    if (!cell) return false
    const props = cell.props as Record<string, unknown>
    // 参与合并（源/被覆盖）的格不裁——颠覆合并布局属于 fixTable 的职责
    if (props['display'] === 'none' || props['rowspan'] || props['colspan']) return false
    if (!cell.childrenLength) return true
    return cell.getChildrenBlocks().every(child =>
      child.flavour === 'paragraph' && !(child as { textLength?: number }).textLength
    )
  }

  /** 多数行长度，并列取较小（较小方向的纠错只裁空尾格，内容安全） */
  const majorityLength = (lens: number[]): number => {
    const counts = new Map<number, number>()
    lens.forEach(l => counts.set(l, (counts.get(l) || 0) + 1))
    let target = lens[0]
    let best = 0
    counts.forEach((cnt, len) => {
      if (cnt > best || (cnt === best && len < target)) {
        best = cnt
        target = len
      }
    })
    return target
  }

  const normalize = () => {
    if (destroyed || !doc.isInitialized) return
    // 只读端是纯观察者，不写修复；可编辑端修复后会广播过来
    if (doc.isReadonly) return

    const rows = table.getChildrenBlocks()
    if (!rows.length) return
    const lens = rows.map(r => r.childrenLength)
    const colWidths: number[] = table.props.colWidths || []
    const uniform = lens.every(l => l === lens[0])
    if (uniform && colWidths.length === lens[0]) return // 预检通过（常态路径）

    // 循环熔断：5 秒滑动窗口内最多 3 轮修复，超过则本轮放弃
    const now = Date.now()
    while (repairTimes.length && now - repairTimes[0] > 5000) repairTimes.shift()
    if (repairTimes.length >= 3) {
      doc.logger.warn(`table normalize: too many repair rounds for ${table.id}, giving up this round`)
      return
    }
    repairTimes.push(now)

    // 目标列数：多数行长度；行超长但尾部含不可安全裁剪的格 → 放大目标（内容优先）
    // getChildrenByIndex 在块不在 vm 时会 throw：由 schedule() 的 try/catch
    // 兜底，本轮修复放弃，等待下一次远端事务重试
    let target = majorityLength(lens)
    rows.forEach((row, i) => {
      if (lens[i] <= target) return
      let trimmable = 0
      for (let k = lens[i] - 1; k >= target; k--) {
        if (!isCellTrimmable(row.getChildrenByIndex(k))) break
        trimmable++
      }
      target = Math.max(target, lens[i] - trimmable)
    })
    if (target <= 0) return

    doc.crud.transact(() => {
      rows.forEach(row => {
        const len = row.childrenLength // 事务内读实时值
        if (len < target) {
          const pads = []
          for (let k = len; k < target; k++) {
            pads.push(doc.schemas.createSnapshot('table-cell', []))
          }
          doc.crud.insertBlocks(row.id, len, pads)
        } else if (len > target) {
          doc.crud.deleteBlocks(row.id, target, len - target)
        }
      })

      // updateProps / insertBlocks / deleteBlocks 内部各自有 transact()，但 Yjs
      // 嵌套事务合并进外层，origin 保持 ORIGIN_SYSTEM_REPAIR，整体不进 undo 栈，
      // 且允许在 Block 锁定期间维护确定性模型一致性。
      const widths = [...(table.props.colWidths || [])]
      if (widths.length !== target) {
        const fallback = widths.length
          ? Math.max(50, Math.floor(widths.reduce((a, b) => a + b, 0) / widths.length))
          : 100
        while (widths.length < target) widths.push(fallback)
        widths.length = target
        table.updateProps({ colWidths: widths })
      }
    }, ORIGIN_SYSTEM_REPAIR)

    doc.logger.warn(`table normalize: repaired ${table.id} to ${target} column(s)`)
  }

  const schedule = () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      try {
        normalize()
      } catch (e) {
        doc.logger.warn('table normalize failed', e)
      }
    })
  }

  // 触发器一：远端 children 变更命中本表（行增删/重排）或本表的行（cell 增删）
  doc.crud.onChildrenUpdate$
    .pipe(takeUntil(table.onDestroy$))
    .subscribe(e => {
      if (e.local) return
      for (const t of e.transactions) {
        const b = t.block
        if (b === (table as BlockCraft.BlockComponent) || b?.parentId === table.id) {
          schedule()
          break
        }
      }
    })

  // 触发器二：远端 colWidths 变更命中本表
  doc.crud.onPropsUpdate$
    .pipe(takeUntil(table.onDestroy$))
    .subscribe(e => {
      if (e.local) return
      for (const t of e.transactions) {
        if (t.block === (table as BlockCraft.BlockComponent) && t.changes.has('colWidths')) {
          schedule()
          break
        }
      }
    })

  // 初始化立即预检一次：持久层里可能已带伤（离线合并/存量损伤随初始同步
  // 到达，不会再触发上面两个远端事件订阅）。O(rows)，一致则立即返回。
  schedule()
}
