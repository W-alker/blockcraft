import { InjectionToken } from '@angular/core'
import type { Observable } from 'rxjs'
import type { BlockCraftDoc } from '../../framework'

/** 视图投影由宿主提供；文档数据、编辑器和历史仍由 Mermaid 块持有。 */
export interface MermaidViewController {
  readonly state$: Observable<boolean>
  readonly isFullscreen: boolean
  toggle(): void
  set(expanded: boolean): void
  destroy(): void
}

export interface MermaidViewHost {
  createController(host: HTMLElement, doc: BlockCraftDoc): MermaidViewController
  readonly expandLabel: string
  readonly collapseLabel: string
}

/** 可选的文档级展开策略；不提供时保留原有窗口全屏视图。 */
export const MERMAID_VIEW_HOST = new InjectionToken<MermaidViewHost>('MERMAID_VIEW_HOST')
