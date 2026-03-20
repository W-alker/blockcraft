import {ComponentPortal} from "@angular/cdk/portal";
import {Subject, skip, takeUntil} from "rxjs";
import {MentionDialog} from "./mention-dialog";
import {IMentionData, IMentionPanel, IMentionResponse, MentionPanelFactory, MentionType} from "../types";

/**
 * Configuration for the default mention panel.
 * The `request` function is the panel's own concern — it is NOT part of MentionPluginConfig.
 */
export interface DefaultMentionPanelConfig {
  /** Async search function — receives keyword and current tab type */
  request: (keyword: string, type: MentionType) => Promise<IMentionResponse>
}

/**
 * Create a MentionPanelFactory backed by the built-in MentionDialog component.
 *
 * The returned factory owns all search/display logic internally.
 * The plugin only provides keyword changes and keyboard events.
 *
 * Usage:
 * ```ts
 * new MentionPlugin({
 *   panel: createDefaultMentionPanel({
 *     request: (keyword, type) => api.searchMentions(keyword, type),
 *   }),
 * })
 * ```
 */
export function createDefaultMentionPanel(config: DefaultMentionPanelConfig): MentionPanelFactory {
  return (ctx) => {
    const overlay = ctx.doc.overlayService.overlay
    const posStrategy = overlay.position().global()
      .top(`${ctx.rect.bottom}px`)
      .left(`${ctx.rect.left}px`)
    const overlayRef = overlay.create({positionStrategy: posStrategy})
    const portal = new ComponentPortal(MentionDialog, null, ctx.doc.injector)
    const dialogRef = overlayRef.attach(portal)

    const destroy$ = new Subject<void>()
    const onConfirm = new Subject<IMentionData>()

    let lastKeyword = ''
    let currentType: MentionType = 'user'

    const doSearch = (keyword: string) => {
      config.request(keyword, currentType).then(res => {
        dialogRef.setInput('list', res.list)
      })
    }

    // Bridge Angular outputs → Observable streams
    dialogRef.instance.confirm
      .pipe(takeUntil(destroy$))
      .subscribe(item => onConfirm.next(item))

    // Tab change → re-search with current keyword (skip initial ngOnInit emission)
    dialogRef.instance.tabChange
      .pipe(skip(1), takeUntil(destroy$))
      .subscribe(type => {
        currentType = type
        doSearch(lastKeyword)
      })

    const panel: IMentionPanel = {
      onKeywordChange(keyword: string) {
        lastKeyword = keyword
        doSearch(keyword)
      },

      onKeydown(e: KeyboardEvent): boolean {
        switch (e.key) {
          case 'ArrowUp':
            dialogRef.instance.moveSelect('up')
            return true
          case 'ArrowDown':
            dialogRef.instance.moveSelect('down')
            return true
          case 'Enter':
            dialogRef.instance.onSure()
            return true
          case 'Tab':
            return true
          default:
            return false
        }
      },

      updatePosition(rect: DOMRect) {
        posStrategy.top(`${rect.bottom}px`).left(`${rect.left}px`)
        overlayRef.updatePosition()
      },

      dispose() {
        destroy$.next()
        destroy$.complete()
        onConfirm.complete()
        overlayRef.dispose()
      },

      onConfirm: onConfirm.asObservable(),
    }

    return panel
  }
}
