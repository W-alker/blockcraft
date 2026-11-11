import { Injectable } from '@angular/core'
import { IBlockSnapshot } from '@ccc/blockcraft'

/** 一份「模板」= 内容快照 + 整页背景图 + 分页视图状态。设计页存、使用页读。 */
export interface TemplatePayload {
  snapshot: IBlockSnapshot | null
  background: string | null
  paginationEnabled: boolean
}

// v2：尺寸从 px 改为「页宽%」，旧 px 数据语义不兼容——升 key 直接作废旧模板，避免旧 px 当百分比渲染撑爆。
const LS_KEY = 'bc-template-deco-payload-v2'

/**
 * 模板存储（playground 版）。
 *
 * 选「root 级 service + localStorage 镜像」而不是裸 JSON 文件：
 * - service 实例随 root injector 存活整个 SPA，`/template` → `/template/use` 路由跳转不丢内存态；
 * - 再镜像一份到 localStorage，刷新/直接打开 `/template/use` 也能恢复上次保存的模板。
 *
 * 移植到 cses：把 save/load 换成调后端接口（保存模板 / 拉取模板），上层组件不动。
 * 注意：snapshot 里可能含 data URL（背景图 / logo），localStorage 有配额上限，
 *       因此 localStorage 仅作「尽力而为」的镜像（写失败静默吞掉），内存态才是主存储。
 */
@Injectable({ providedIn: 'root' })
export class TemplateStore {
  private payload: TemplatePayload | null = null

  save(payload: TemplatePayload): void {
    this.payload = normalizeTemplatePayload(payload)
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.payload)) } catch { /* 超配额等：忽略，内存态仍在 */ }
  }

  load(): TemplatePayload | null {
    if (this.payload) return this.payload
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) this.payload = normalizeTemplatePayload(JSON.parse(raw))
    } catch { /* 解析失败：当作没有 */ }
    return this.payload
  }

  clear(): void {
    this.payload = null
    try { localStorage.removeItem(LS_KEY) } catch { /* 忽略 */ }
  }
}

/** 兼容 v2 旧 payload：缺少分页字段时保持原来的连续布局。 */
export function normalizeTemplatePayload(value: unknown): TemplatePayload {
  const payload =
    value && typeof value === 'object'
      ? value as Partial<TemplatePayload>
      : {}
  return {
    snapshot: payload.snapshot ?? null,
    background:
      typeof payload.background === 'string' && payload.background
        ? payload.background
        : null,
    paginationEnabled: payload.paginationEnabled === true,
  }
}
