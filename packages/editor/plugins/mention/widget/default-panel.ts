import {Subject, skip, takeUntil} from "rxjs";
import {getPositionWithOffset} from "../../../framework";
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
    const destroy$ = new Subject<void>()
    const anchor = document.createElement('span')
    anchor.style.position = 'fixed'
    anchor.style.display = 'block'
    anchor.style.pointerEvents = 'none'
    anchor.style.opacity = '0'
    anchor.setAttribute('aria-hidden', 'true')
    document.body.append(anchor)

    const moveAnchor = (rect: DOMRect) => {
      anchor.style.left = `${rect.left}px`
      anchor.style.top = `${rect.top}px`
      anchor.style.width = `${Math.max(rect.width, 1)}px`
      anchor.style.height = `${Math.max(rect.height, 1)}px`
    }

    moveAnchor(ctx.rect)

    const {componentRef: dialogRef, overlayRef} = ctx.doc.overlayService.createConnectedOverlay<MentionDialog>({
      target: anchor,
      component: MentionDialog,
      positions: [
        getPositionWithOffset('bottom-left', 0, 0),
        getPositionWithOffset('top-left', 0, 0),
      ],
    }, destroy$, () => {
      anchor.remove()
    })

    const onConfirm = new Subject<IMentionData>()

    let lastKeyword = ''
    let currentType: MentionType = 'user'

    const doSearch = (keyword: string) => {
      config.request(keyword, currentType).then(res => {
        if (!overlayRef.hasAttached()) return
        dialogRef.setInput('list', res.list)
        requestAnimationFrame(() => {
          if (overlayRef.hasAttached()) {
            overlayRef.updatePosition()
          }
        })
      })
    }

    // Bridge Angular outputs → Observable streams
    dialogRef.instance.confirm
      .pipe(takeUntil(destroy$))
      .subscribe(item => onConfirm.next({...item, mentionType: currentType}))

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
            dialogRef.instance.moveTab(e.shiftKey ? 'prev' : 'next')
            return true
          default:
            return false
        }
      },

      updatePosition(rect: DOMRect) {
        moveAnchor(rect)
        overlayRef.updatePosition()
      },

      dispose() {
        destroy$.next()
        destroy$.complete()
        onConfirm.complete()
      },

      onConfirm: onConfirm.asObservable(),
    }

    return panel
  }
}
