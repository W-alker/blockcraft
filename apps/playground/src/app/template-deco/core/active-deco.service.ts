import { Injectable } from '@angular/core'
import type { BlockPositionState } from '@ccc/blockcraft'
import { BehaviorSubject } from 'rxjs'

/** 装饰块的最小读写面（只用公开面：flavour/props/updateProps）——面板按 id 解析出块后当这个形状用。 */
export interface DecoBlockRef {
  flavour?: string
  props?: { placement?: BlockPositionState; wr?: number; ar?: number; y?: number; deg?: number; float?: 'left' | 'right'; align?: 'left' | 'center' | 'right'; mb?: number; ml?: number; mr?: number }
  updateProps(p: { placement?: BlockPositionState | null; y?: number | null; deg?: number | null; float?: 'left' | 'right' | null; align?: 'left' | 'center' | 'right' | null; mb?: number | null; ml?: number | null; mr?: number | null }): void
}

/**
 * 「当前操作的装饰物料」共享通道（root 单例）。物料被点/拖时 `set(this.id)`；右侧「位置/层级」面板订阅、按 id 解析。
 *
 * 用 **BehaviorSubject** 而不是 signal：面板是 OnPush，别的组件（物料）改共享 **signal** 不一定触发面板 re-check；
 * 订阅 + `markForCheck` 是可靠范式（同 debug 面板订阅 selection 的做法）。
 *
 * 存 **id** 而不是组件实例：物料浮起后会被移到 root 末尾（脱离文字流），移动可能触发组件重建；存 id 每次 `getBlockById` 拿当前实例。
 * 选中真源已经回到框架 BlockSelection；本服务只为模板右侧面板保留一个轻量 id 投影。
 */
@Injectable({ providedIn: 'root' })
export class ActiveDecoService {
  readonly active$ = new BehaviorSubject<string | null>(null)
  set(id: string | null): void { this.active$.next(id) }
}
