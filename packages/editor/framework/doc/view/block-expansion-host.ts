import { InjectionToken } from '@angular/core'
import type { Observable } from 'rxjs'
import type { BlockCraftDoc } from '../document'

/** 视图投影由宿主提供；文档数据、编辑器和历史仍由各块持有。 */
export interface BlockExpansionController {
  readonly state$: Observable<boolean>
  readonly isExpanded: boolean
  toggle(): void
  set(expanded: boolean): void
  destroy(): void
}

export interface BlockExpansionHost {
  createController(host: HTMLElement, doc: BlockCraftDoc): BlockExpansionController
  readonly expandLabel: string
  readonly collapseLabel: string
}

/** 可选的块展开策略；块按自身视口能力接入，不提供时保留该块原有视图策略。 */
export const BLOCK_EXPANSION_HOST = new InjectionToken<BlockExpansionHost>('BLOCK_EXPANSION_HOST')
