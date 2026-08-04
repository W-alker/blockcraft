import {TableCellFlowPlan} from './table-cell-flow'

/**
 * Cell-flow 是分页器的包内稳定布局附件，不属于公开 PaginationItem / BlockMeta 契约。
 * WeakMap 让纯分页对象保持原有可序列化形状，同时允许 live、sparse 与 print 在一次
 * 稳定布局生命周期内共享同一计划。克隆对象时必须显式调用 copyTableCellFlowPlan。
 */
const plans = new WeakMap<object, TableCellFlowPlan>()

export function setTableCellFlowPlan(
  owner: object,
  plan: TableCellFlowPlan | undefined,
): void {
  if (plan) plans.set(owner, plan)
  else plans.delete(owner)
}

export function getTableCellFlowPlan(
  owner: object,
): TableCellFlowPlan | undefined {
  return plans.get(owner)
}

export function copyTableCellFlowPlan(
  source: object,
  target: object,
  clone: (plan: TableCellFlowPlan) => TableCellFlowPlan,
): void {
  const plan = plans.get(source)
  if (plan) plans.set(target, clone(plan))
}
