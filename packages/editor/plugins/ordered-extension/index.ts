import {
  closetBlockId,
  DocPlugin,
  EventListen,
  getPositionWithOffset,
  ORIGIN_SYSTEM_REPAIR,
  UIEventStateContext
} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {nextTick} from "../../global";
import {OrderedPrefixToolbar} from "./widgets/ordered-prefix-toolbar";

type OrderableBlock = {
  id: string
  flavour: string
  props: {
    depth?: number | string | null
    heading?: number | string | null
    order?: number | string | null
    start?: number | string | null
  } & Record<string, unknown>
}

type OrderableParent = {
  id: string
}

export class OrderedBlockPlugin extends DocPlugin {
  private _sub = new Subscription()

  private _closeToolbar$ = new Subject()

  private _pendingParentIds = new Set<string>()

  private _pendingStartBlockIds = new Set<string>()

  private _flushScheduled = false

  private _destroyed = false

  @EventListen('mouseDown', {flavour: "ordered"})
  onMouseDown(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const evt = ctx.getDefaultEvent<MouseEvent>()
    if (evt.button !== 0 || !(evt.target instanceof HTMLButtonElement) || !evt.target.classList.contains('ordered-block-prefix')) return

    const blockId = closetBlockId(evt.target)
    if (!blockId) return
    const orderedBlock = this.getLiveOrderedBlock(blockId)
    if (!orderedBlock) return
    if (this.doc.readonlyManager?.isReadonly(orderedBlock) ?? this.doc.isReadonly) return
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<OrderedPrefixToolbar>({
      target: evt.target,
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
        return
      }

      const parentIds = [...this._pendingParentIds]
      const fullParentSet = new Set(parentIds)
      const startBlockIds = [...this._pendingStartBlockIds]
        .filter(blockId => {
          const parentId = this.doc.model.getParentId(blockId)
          return parentId !== null && !fullParentSet.has(parentId)
        })
      this._pendingParentIds.clear()
      this._pendingStartBlockIds.clear()
      if (this.doc.isReadonly) return
      this.doc.crud.transact(() => {
        parentIds.forEach(parentId => updateOrdersInParent(this.doc, parentId))
        startBlockIds.forEach(blockId => updateOrdersFromStartBlock(this.doc, blockId))
      }, ORIGIN_SYSTEM_REPAIR)
    })
  }
}

type OrderCounter = {
  depth: number
  heading: number
  nextOrder: number
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

const updateOrdersInParent = (doc: BlockCraft.Doc, parentId: string) => {
  const parentChildren = getOrderableChildren(doc, parentId)

  const counters = new Map<string, OrderCounter>()

  for (const block of parentChildren) {
    pruneCounters(counters, block)
    if (block.flavour !== 'ordered') continue

    const orderedBlock = block
    const depth = getDepth(orderedBlock)
    const heading = getHeadingLevel(orderedBlock)
    const startOrder = getStartOrder(orderedBlock)
    const key = getCounterKey(depth, heading)
    const order = startOrder ?? counters.get(key)?.nextOrder ?? 0

    if (!isOrderEqual(orderedBlock.props.order, order)) {
      doc.crud.updateBlockProps(orderedBlock.id, {order})
    }

    counters.set(key, {
      depth,
      heading,
      nextOrder: order + 1
    })
  }
}

const updateOrdersFromStartBlock = (doc: BlockCraft.Doc, blockId: string) => {
  const block = getOrderableBlock(doc, blockId)
  if (!block || block.flavour !== 'ordered') return
  const parentId = doc.model.getParentId(blockId)
  if (!parentId) return

  const parentChildren = getOrderableChildren(doc, parentId)
  const startIndex = parentChildren.findIndex(current => current.id === blockId)
  if (startIndex === -1) return

  const depth = getDepth(block)
  const heading = getHeadingLevel(block)
  let order = resolveOrderAtStart(parentChildren, startIndex, depth, heading)

  for (let i = startIndex; i < parentChildren.length; i++) {
    const current = parentChildren[i]
    if (i > startIndex && prunesCounter(current, depth, heading)) break
    if (current.flavour !== 'ordered') continue
    if (!isSameCounter(current, depth, heading)) continue
    if (i > startIndex && getStartOrder(current) !== null) break

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
  const startOrder = getStartOrder(parentChildren[startIndex])
  if (startOrder !== null) return startOrder

  for (let i = startIndex - 1; i >= 0; i--) {
    const prev = parentChildren[i]
    if (prunesCounter(prev, depth, heading)) break
    if (prev.flavour !== 'ordered' || !isSameCounter(prev, depth, heading)) continue
    return normalizeNonNegativeInteger(prev.props.order) + 1
  }

  return 0
}

const pruneCounters = (counters: Map<string, OrderCounter>, block: OrderableBlock) => {
  const depth = getDepth(block)
  const heading = getHeadingLevel(block)

  counters.forEach((counter, key) => {
    if (prunesCounter(block, counter.depth, counter.heading)) {
      counters.delete(key)
    }
  })
}

const prunesCounter = (block: OrderableBlock, counterDepth: number, counterHeading: number) => {
  const depth = getDepth(block)
  if (counterDepth > depth) return true

  const heading = getHeadingLevel(block)
  return heading > 0 && (counterHeading === 0 || counterHeading > heading)
}

const isSameCounter = (block: OrderableBlock, depth: number, heading: number) => {
  return getDepth(block) === depth && getHeadingLevel(block) === heading
}

const getCounterKey = (depth: number, heading: number) => {
  return `${depth}:${heading}`
}

const getHeadingLevel = (block: OrderableBlock) => {
  return normalizeNonNegativeInteger(block.props['heading'])
}

const getDepth = (block: OrderableBlock) => {
  return normalizeNonNegativeInteger(block.props['depth'])
}

const getStartOrder = (block: OrderableBlock) => {
  const start = normalizeNonNegativeInteger(block.props.start)
  if (start <= 0) return null
  return start - 1
}

const isOrderEqual = (current: unknown, next: number) => {
  const currentNumber = Number(current ?? 0)
  return Number.isFinite(currentNumber) && Math.floor(currentNumber) === next
}

const normalizeNonNegativeInteger = (value: unknown) => {
  const numberValue = Number(value ?? 0)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0

  return Math.floor(numberValue)
}
