import {
  closetBlockId,
  DocPlugin,
  EventListen,
  getPositionWithOffset,
  IBlockProps,
  ORIGIN_SYSTEM_REPAIR,
  UIEventStateContext
} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {nextTick} from "../../global";
import {OrderedPrefixToolbar} from "./widgets/ordered-prefix-toolbar";
import {
  getOrderedCounterDepth,
  getOrderedCounterHeading,
  getOrderedCounterKey,
  getOrderedCounterStart,
  isSameOrderedCounter,
  normalizeOrderedCounterInteger,
  OrderedCounterBlock as OrderableBlock,
  prunesOrderedCounter,
} from "../../blocks/ordered-block/utils/ordered-counter-group";
import {
  isOrderedMarkerStyleId,
  OrderedMarkerStyleId,
} from "../../blocks/ordered-block/utils/get-number-prefix";

type OrderableParent = {
  id: string
}

export class OrderedBlockPlugin extends DocPlugin {
  override name = 'ordered-block'

  private _sub = new Subscription()

  private _closeToolbar$ = new Subject()

  private _pendingParentIds = new Set<string>()

  private _pendingStartBlockIds = new Set<string>()

  private _pendingInsertedBlockIds = new Set<string>()

  private _flushScheduled = false

  private _destroyed = false

  @EventListen('mouseDown', {flavour: "ordered"})
  onMouseDown(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const evt = ctx.getDefaultEvent<MouseEvent>()
    const prefix = evt.target instanceof Element
      ? evt.target.closest<HTMLElement>('.ordered-block-prefix')
      : null
    if (evt.button !== 0 || !prefix) return

    const blockId = closetBlockId(prefix)
    if (!blockId) return
    const orderedBlock = this.getLiveOrderedBlock(blockId)
    if (!orderedBlock) return
    if (this.doc.readonlyManager?.isReadonly(orderedBlock) ?? this.doc.isReadonly) return
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<OrderedPrefixToolbar>({
      target: prefix,
      component: OrderedPrefixToolbar,
      positions: [getPositionWithOffset('bottom-left'), getPositionWithOffset('top-left')],
      backdrop: true
    }, this._closeToolbar$)
    orderedBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this._closeToolbar$.next(true)
    })
    this.doc.readonlyManager?.stateChange$
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe(() => {
        if (this.isBlockWritable(orderedBlock)) return
        this._closeToolbar$.next(true)
      })

    componentRef.setInput('orderedBlock', orderedBlock)
    componentRef.setInput('isBlockAlive', (block: BlockCraft.BlockComponent) => this.isBlockWritable(block))
    componentRef.instance.onPropsChanged$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      if (!this.isBlockAlive(orderedBlock)) return
      this._scheduleParentOf(orderedBlock as unknown as OrderableBlock)
      this._closeToolbar$.next(true)
    })
    return true
  }

  init() {
    this._destroyed = false
    this._sub = this.doc.onChildrenUpdate$.subscribe(event => {
      if (event.isUndoRedo || !event.local) return;

      event.transactions.forEach(tr => {
        tr.inserted?.forEach(block => this._pendingInsertedBlockIds.add(block.id))
        this._scheduleParent(tr.block as unknown as OrderableParent)
      })
    })

    this._sub.add(
      this.doc.onPropsUpdate$.subscribe((event) => {
        if (event.isUndoRedo) return;
        event.transactions.forEach(tr => {
          const affectsOrderBoundary = tr.changes.has('depth') || tr.changes.has('heading')
          const affectsOrderedStart = tr.block.flavour === 'ordered' && tr.changes.has('start')
          if (affectsOrderBoundary) {
            this._scheduleParentOf(tr.block as unknown as OrderableBlock)
            return
          }
          if (affectsOrderedStart) {
            this._scheduleStartBlock(tr.block as unknown as OrderableBlock)
          }
        })
      })
    )
  }

  override destroy() {
    this._destroyed = true
    this._sub.unsubscribe()
    this._pendingParentIds.clear()
    this._pendingStartBlockIds.clear()
    this._pendingInsertedBlockIds.clear()
    this._closeToolbar$.next(true)
  }

  private _scheduleParentOf(block: Pick<OrderableBlock, 'id'>) {
    const parentId = this.doc.model.getParentId(block.id)
    if (!parentId) return
    this._scheduleParent(parentId)
  }

  private _scheduleParent(parent: OrderableParent | string) {
    this._pendingParentIds.add(typeof parent === 'string' ? parent : parent.id)
    this._ensureFlushScheduled()
  }

  private _scheduleStartBlock(block: Pick<OrderableBlock, 'id' | 'flavour'>) {
    if (block.flavour !== 'ordered') return
    this._pendingStartBlockIds.add(block.id)
    this._ensureFlushScheduled()
  }

  private getLiveOrderedBlock(blockId: string): BlockCraft.IBlockComponents['ordered'] | null {
    try {
      const block = this.doc.getBlockById(blockId)
      if (block.flavour !== 'ordered') return null
      return this.isBlockAlive(block) ? block as BlockCraft.IBlockComponents['ordered'] : null
    } catch {
      return null
    }
  }

  private isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private isBlockWritable(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    return this.isBlockAlive(block) &&
      !(this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly)
  }

  private _ensureFlushScheduled() {
    if (this._flushScheduled) return
    this._flushScheduled = true
    nextTick().then(() => {
      this._flushScheduled = false
      if (this._destroyed) {
        this._pendingParentIds.clear()
        this._pendingStartBlockIds.clear()
        this._pendingInsertedBlockIds.clear()
        return
      }

      const parentIds = [...this._pendingParentIds]
      const fullParentSet = new Set(parentIds)
      const insertedBlockIds = new Set(this._pendingInsertedBlockIds)
      const startBlockIds = [...this._pendingStartBlockIds]
        .filter(blockId => {
          const parentId = this.doc.model.getParentId(blockId)
          return parentId !== null && !fullParentSet.has(parentId)
        })
      this._pendingParentIds.clear()
      this._pendingStartBlockIds.clear()
      this._pendingInsertedBlockIds.clear()
      if (this.doc.isReadonly) return
      this.doc.crud.transact(() => {
        parentIds.forEach(parentId => updateOrdersInParent(this.doc, parentId, insertedBlockIds))
        startBlockIds.forEach(blockId => updateOrdersFromStartBlock(this.doc, blockId))
      }, ORIGIN_SYSTEM_REPAIR)
    })
  }
}

type OrderCounter = {
  depth: number
  heading: number
  nextOrder: number
  markerStyle: OrderedMarkerStyleId | null
}

const getOrderableBlock = (
  doc: BlockCraft.Doc,
  blockId: string,
): OrderableBlock | null => {
  const flavour = doc.model.getFlavour(blockId)
  const props = doc.model.getProps(blockId)
  if (!flavour || !props) return null
  return {
    id: blockId,
    flavour,
    props: props as OrderableBlock['props'],
  }
}

const getOrderableChildren = (doc: BlockCraft.Doc, parentId: string): OrderableBlock[] => {
  return doc.model.getChildrenIds(parentId)
    .map(blockId => getOrderableBlock(doc, blockId))
    .filter((block): block is OrderableBlock => !!block)
}

const updateOrdersInParent = (
  doc: BlockCraft.Doc,
  parentId: string,
  insertedBlockIds: ReadonlySet<string>,
) => {
  const parentChildren = getOrderableChildren(doc, parentId)

  const counters = new Map<string, OrderCounter>()

  for (const block of parentChildren) {
    pruneCounters(counters, block)
    if (block.flavour !== 'ordered') continue

    const orderedBlock = block
    const depth = getOrderedCounterDepth(orderedBlock)
    const heading = getOrderedCounterHeading(orderedBlock)
    const startOrder = getOrderedCounterStart(orderedBlock)
    const key = getOrderedCounterKey(depth, heading)
    const previousCounter = startOrder === null ? counters.get(key) : undefined
    const order = startOrder ?? previousCounter?.nextOrder ?? 0
    const markerStyle = resolveMarkerStyleForCounter(orderedBlock, previousCounter)
    const patch: Partial<IBlockProps> = {}
    let hasPatch = false

    if (!isOrderEqual(orderedBlock.props.order, order)) {
      patch['order'] = order
      hasPatch = true
    }
    if (
      insertedBlockIds.has(orderedBlock.id) &&
      !hasOwnMarkerStyle(orderedBlock) &&
      markerStyle !== null
    ) {
      patch['ms'] = markerStyle
      hasPatch = true
    }
    if (hasPatch) {
      doc.crud.updateBlockProps(orderedBlock.id, patch)
    }

    counters.set(key, {
      depth,
      heading,
      nextOrder: order + 1,
      markerStyle,
    })
  }
}

const hasOwnMarkerStyle = (block: OrderableBlock) =>
  Object.prototype.hasOwnProperty.call(block.props, 'ms')

const resolveMarkerStyleForCounter = (
  block: OrderableBlock,
  previousCounter: OrderCounter | undefined,
): OrderedMarkerStyleId | null => {
  const current = block.props['ms']
  if (isOrderedMarkerStyleId(current)) return current
  if (hasOwnMarkerStyle(block)) return null
  return previousCounter?.markerStyle ?? null
}

const updateOrdersFromStartBlock = (doc: BlockCraft.Doc, blockId: string) => {
  const block = getOrderableBlock(doc, blockId)
  if (!block || block.flavour !== 'ordered') return
  const parentId = doc.model.getParentId(blockId)
  if (!parentId) return

  const parentChildren = getOrderableChildren(doc, parentId)
  const startIndex = parentChildren.findIndex(current => current.id === blockId)
  if (startIndex === -1) return

  const depth = getOrderedCounterDepth(block)
  const heading = getOrderedCounterHeading(block)
  let order = resolveOrderAtStart(parentChildren, startIndex, depth, heading)

  for (let i = startIndex; i < parentChildren.length; i++) {
    const current = parentChildren[i]
    if (i > startIndex && prunesOrderedCounter(current, depth, heading)) break
    if (current.flavour !== 'ordered') continue
    if (!isSameOrderedCounter(current, depth, heading)) continue
    if (i > startIndex && getOrderedCounterStart(current) !== null) break

    if (!isOrderEqual(current.props.order, order)) {
      doc.crud.updateBlockProps(current.id, {order})
    }
    order++
  }
}

const resolveOrderAtStart = (
  parentChildren: OrderableBlock[],
  startIndex: number,
  depth: number,
  heading: number
) => {
  const startOrder = getOrderedCounterStart(parentChildren[startIndex])
  if (startOrder !== null) return startOrder

  for (let i = startIndex - 1; i >= 0; i--) {
    const prev = parentChildren[i]
    if (prunesOrderedCounter(prev, depth, heading)) break
    if (prev.flavour !== 'ordered' || !isSameOrderedCounter(prev, depth, heading)) continue
    return normalizeOrderedCounterInteger(prev.props.order) + 1
  }

  return 0
}

const pruneCounters = (counters: Map<string, OrderCounter>, block: OrderableBlock) => {
  const depth = getOrderedCounterDepth(block)
  const heading = getOrderedCounterHeading(block)

  counters.forEach((counter, key) => {
    if (prunesOrderedCounter(block, counter.depth, counter.heading)) {
      counters.delete(key)
    }
  })
}

const isOrderEqual = (current: unknown, next: number) => {
  const currentNumber = Number(current ?? 0)
  return Number.isFinite(currentNumber) && Math.floor(currentNumber) === next
}
