import {OverlayRef} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {
  BLOCK_OBJECT_GROUP_FLAVOUR,
  closetBlockId,
  DocPlugin,
  getPositionWithOffset,
  type BlockObjectAlignment,
  type BlockObjectBlockLayout,
} from '../../framework'
import {
  ObjectGroupToolbarComponent,
  type ObjectGroupToolbarAction,
  type ObjectGroupToolbarMode,
} from './object-group-toolbar.component'

export * from './object-group-toolbar.component'

interface GroupSelectionState {
  mode: ObjectGroupToolbarMode
  anchor: HTMLElement
  blockIds: string[]
  canGroup: boolean
  canUngroup: boolean
  canDistribute: boolean
  objectLayout: BlockObjectBlockLayout
  canMoveForward: boolean
  canMoveBackward: boolean
}

const OBJECT_ALIGNMENT_ACTIONS = new Set<BlockObjectAlignment>([
  'left',
  'horizontal-center',
  'right',
  'top',
  'vertical-center',
  'bottom',
  'center',
  'horizontal-distribute',
  'vertical-distribute',
])

const isObjectAlignment = (
  action: ObjectGroupToolbarAction,
): action is BlockObjectAlignment =>
  OBJECT_ALIGNMENT_ACTIONS.has(action as BlockObjectAlignment)

/**
 * Object group interaction shell.
 *
 * Shift-click creates a contiguous model boundary selection inside the root
 * placement plane. A first click on grouped content selects the group;
 * subsequent descendant interaction stays member-owned while the ancestor
 * group keeps a presentation-only active frame.
 */
export class ObjectGroupToolbarPlugin extends DocPlugin {
  override name = 'object-group-toolbar'

  private readonly _subscription = new Subscription()
  private readonly _closeToolbar$ = new Subject<void>()
  private _toolbarRef?: OverlayRef
  private _toolbarKey = ''
  private _selectionWithinGroupHosts = new Set<HTMLElement>()

  init(): void {
    this._subscription.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this.onPointerDown(event)),
    )
    this._subscription.add(
      this.doc.selection.selectionChange$.subscribe(selection => {
        this.syncSelectionWithinGroupFrames(selection)
        this.syncToolbar()
      }),
    )
    this._subscription.add(
      this.doc.placement.state$.subscribe(state => {
        if (state !== 'idle') {
          this.closeToolbar()
          return
        }
        queueMicrotask(() => this.syncToolbar())
      }),
    )
    this._subscription.add(
      this.doc.subscribeReadonlyChange(readonly => {
        if (readonly) this.closeToolbar()
      }),
    )
  }

  destroy(): void {
    this.closeToolbar()
    this.clearSelectionWithinGroupFrames()
    this._subscription.unsubscribe()
    this._closeToolbar$.complete()
  }

  closeToolbar = (): void => {
    this._closeToolbar$.next()
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._toolbarKey = ''
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.doc.isReadonly) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!this.doc.root.hostElement.contains(target)) return

    const topLevelId = this.resolveTopLevelAbsoluteObjectId(target)
    if (event.shiftKey && topLevelId) {
      if (this.extendObjectSelection(topLevelId)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }

    const groupElement = target.closest<HTMLElement>('[data-bc-object-group]')
    if (!groupElement) return
    const groupId = closetBlockId(groupElement)
    if (!groupId || !this.doc.placement.isObjectGroup(groupId)) return

    const current = this.doc.selection.value
    const selectionIsWithinGroup = this.selectionTouchesGroup(current, groupId)
    const directChildId = this.resolveDirectGroupChildId(target, groupId)
    const moveEdge = target.closest('.object-group-block__move-edge')
    if (selectionIsWithinGroup && directChildId && !moveEdge) {
      // Once this group or any descendant owns Selection, member plugins must
      // continue receiving capture-phase pointerdown. Re-intercepting here
      // would prevent image/shape/text-box/WordArt local drag from arming.
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    this.doc.selection.selectBlock(groupId)
    const group = this.safeGetBlock(groupId)
    if (
      moveEdge &&
      group &&
      !this.doc.readonlyManager.isReadonly(group)
    ) {
      this.doc.placement.startDrag(event, group)
    }
  }

  private extendObjectSelection(targetId: string): boolean {
    const parentId = this.doc.model.getParentId(targetId)
    if (!parentId || !this.doc.placement.isPlacementLayout(parentId)) return false
    const siblings = this.doc.model.getChildrenIds(parentId)
    const targetIndex = siblings.indexOf(targetId)
    if (targetIndex < 0) return false

    const selection = this.doc.selection.value
    let anchorIndex = targetIndex
    if (
      selection?.anchor.type === 'boundary' &&
      selection.head.type === 'boundary' &&
      selection.anchor.blockId === parentId &&
      selection.head.blockId === parentId
    ) {
      anchorIndex = Math.max(
        0,
        Math.min(selection.anchor.index, selection.head.index),
      )
    } else if (
      selection?.isInSameBlock &&
      selection.anchor.type === 'selected' &&
      selection.head.type === 'selected'
    ) {
      const selectedId = selection.firstBlockId
      if (this.doc.model.getParentId(selectedId) === parentId) {
        anchorIndex = siblings.indexOf(selectedId)
      }
    }
    if (anchorIndex < 0 || anchorIndex === targetIndex) return false
    const from = Math.min(anchorIndex, targetIndex)
    const to = Math.max(anchorIndex, targetIndex) + 1
    const ids = siblings.slice(from, to)
    if (!this.doc.placement.canAlignObjects(ids)) return false
    this.selectBoundary(parentId, from, to)
    return true
  }

  private syncToolbar(): void {
    const state = this.resolveToolbarState()
    if (!state || this.doc.isReadonly) {
      this.closeToolbar()
      return
    }
    const key = [
      state.mode,
      state.blockIds.join(','),
      state.canGroup,
      state.canUngroup,
      state.canDistribute,
      state.objectLayout,
      state.canMoveForward,
      state.canMoveBackward,
    ].join(':')
    if (this._toolbarRef && this._toolbarKey === key) return
    this.closeToolbar()

    const {overlayRef, componentRef} =
      this.doc.overlayService.createConnectedOverlay<ObjectGroupToolbarComponent>(
        {
          target: state.anchor,
          component: ObjectGroupToolbarComponent,
          positions: [
            getPositionWithOffset('top-center', 0, 8),
            getPositionWithOffset('bottom-center', 0, 8),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
        },
        this._closeToolbar$,
        this.closeToolbar,
      )
    this._toolbarRef = overlayRef
    this._toolbarKey = key
    componentRef.setInput('mode', state.mode)
    componentRef.setInput('canGroup', state.canGroup)
    componentRef.setInput('canUngroup', state.canUngroup)
    componentRef.setInput('canDistribute', state.canDistribute)
    componentRef.setInput('objectLayout', state.objectLayout)
    componentRef.setInput('canMoveForward', state.canMoveForward)
    componentRef.setInput('canMoveBackward', state.canMoveBackward)
    componentRef.instance.action
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(mode => this.execute(mode, state.blockIds))
  }

  private resolveToolbarState(): GroupSelectionState | null {
    const selection = this.doc.selection.value
    if (!selection) return null
    if (
      selection.isInSameBlock &&
      selection.anchor.type === 'selected' &&
      selection.head.type === 'selected' &&
      this.doc.placement.isObjectGroup(selection.firstBlockId)
    ) {
      const group = this.safeGetBlock(selection.firstBlockId)
      return group?.hostElement.isConnected
        ? {
            mode: 'ungroup',
            anchor: group.hostElement,
            blockIds: [group.id],
            canGroup: false,
            canUngroup: this.doc.placement.canUngroup(group.id),
            canDistribute: false,
            objectLayout: this.doc.placement.getObjectLayout(group),
            canMoveForward: this.doc.placement.canMoveForward(group.id),
            canMoveBackward: this.doc.placement.canMoveBackward(group.id),
          }
        : null
    }

    const ids = selection.getBoundarySelectedChildIds?.() ?? null
    if (!ids || !this.doc.placement.canAlignObjects(ids)) return null
    const first = this.safeGetBlock(ids[0]!)
    return first?.hostElement.isConnected
      ? {
          mode: 'group',
          anchor: first.hostElement,
          blockIds: ids,
          canGroup: this.doc.placement.canGroup(ids),
          canUngroup: false,
          canDistribute: this.doc.placement.canAlignObjects(
            ids,
            'horizontal-distribute',
          ),
          objectLayout: 'over',
          canMoveForward: false,
          canMoveBackward: false,
        }
      : null
  }

  private execute(
    mode: ObjectGroupToolbarAction,
    blockIds: readonly string[],
  ): void {
    this.closeToolbar()
    if (typeof mode === 'object') {
      const groupId = blockIds[0]
      if (!groupId) return
      const group = this.safeGetBlock(groupId)
      if (!group) return
      this.doc.placement.setObjectLayout(group, mode.value)
      queueMicrotask(() => this.syncToolbar())
      return
    }
    if (isObjectAlignment(mode)) {
      this.doc.placement.alignObjects(blockIds, mode)
      queueMicrotask(() => this.syncToolbar())
      return
    }
    if (mode === 'move-forward' || mode === 'move-backward') {
      const groupId = blockIds[0]
      if (!groupId) return
      if (mode === 'move-forward') this.doc.placement.moveForward(groupId)
      else this.doc.placement.moveBackward(groupId)
      queueMicrotask(() => this.syncToolbar())
      return
    }
    if (mode === 'group') {
      const groupId = this.doc.placement.group(blockIds)
      if (!groupId) return
      queueMicrotask(() => this.doc.selection.selectBlock(groupId))
      return
    }

    const groupId = blockIds[0]
    if (!groupId) return
    const parentId = this.doc.model.getParentId(groupId)
    const startIndex = parentId
      ? this.doc.model.getChildrenIds(parentId).indexOf(groupId)
      : -1
    const children = this.doc.placement.ungroup(groupId)
    if (!parentId || startIndex < 0 || !children.length) return
    queueMicrotask(() => {
      this.selectBoundary(parentId, startIndex, startIndex + children.length)
    })
  }

  private selectBoundary(parentId: string, from: number, to: number): void {
    this.doc.selection.replay({
      anchor: {blockId: parentId, type: 'boundary', index: from},
      head: {blockId: parentId, type: 'boundary', index: to},
      commonParent: parentId,
    })
  }

  private resolveTopLevelAbsoluteObjectId(target: Element): string | null {
    const closest = target.closest<HTMLElement>('[data-block-id]')
    let id = closest ? closetBlockId(closest) : null
    while (id) {
      const parentId = this.doc.model.getParentId(id)
      if (!parentId) return null
      if (this.doc.placement.isPlacementLayout(parentId)) return id
      id = parentId
    }
    return null
  }

  private resolveDirectGroupChildId(
    target: Element,
    groupId: string,
  ): string | null {
    const closest = target.closest<HTMLElement>('[data-block-id]')
    let id = closest ? closetBlockId(closest) : null
    while (id && id !== groupId) {
      const parentId = this.doc.model.getParentId(id)
      if (parentId === groupId) return id
      id = parentId
    }
    return null
  }

  private selectionTouchesGroup(
    selection: BlockCraft.Selection | null,
    groupId: string,
  ): boolean {
    if (!selection) return false
    return [selection.anchor.blockId, selection.head.blockId]
      .some(id => this.resolveOwningGroupId(id) === groupId)
  }

  /**
   * Keep an ancestor group frame visible for a selection anywhere in its
   * mounted subtree. This presentation pass walks at most two model ancestry
   * chains; it never scans the document or measures DOM geometry.
   */
  private syncSelectionWithinGroupFrames(
    selection: BlockCraft.Selection | null,
  ): void {
    const nextHosts = new Set<HTMLElement>()
    if (selection) {
      const endpointIds = new Set([
        selection.anchor.blockId,
        selection.head.blockId,
      ])
      endpointIds.forEach(id => {
        const groupId = this.resolveOwningGroupId(id)
        if (!groupId) return
        const group = this.safeGetBlock(groupId)
        if (group?.hostElement.isConnected) nextHosts.add(group.hostElement)
      })
    }

    this._selectionWithinGroupHosts.forEach(host => {
      if (!nextHosts.has(host)) {
        host.classList.remove('bc-object-group--selection-within')
      }
    })
    nextHosts.forEach(host => {
      if (!this._selectionWithinGroupHosts.has(host)) {
        host.classList.add('bc-object-group--selection-within')
      }
    })
    this._selectionWithinGroupHosts = nextHosts
  }

  private clearSelectionWithinGroupFrames(): void {
    this._selectionWithinGroupHosts.forEach(host => {
      host.classList.remove('bc-object-group--selection-within')
    })
    this._selectionWithinGroupHosts.clear()
  }

  private resolveOwningGroupId(blockId: string): string | null {
    let currentId: string | null = blockId
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      if (this.doc.placement.isObjectGroup(currentId)) return currentId
      currentId = this.doc.model.getParentId(currentId)
    }
    return null
  }

  private safeGetBlock(id: string): BlockCraft.BlockComponent | null {
    try {
      return this.doc.getBlockById(id)
    } catch {
      return null
    }
  }
}
