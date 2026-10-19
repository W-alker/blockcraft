import * as Y from 'yjs'
import {BehaviorSubject, Subject} from 'rxjs'
import {
  BlockNodeType,
  NativeBlockModel,
  YBlock,
  native2YBlock,
} from '../block-std'
import {DocCRUD} from './crud'
import {BlockModelGraph} from './model-graph'

const ROOT_ID = 'stress-root'
const PARENT_IDS = ['parent-a', 'parent-b', 'parent-c', 'parent-d'] as const
const INITIAL_BLOCK_IDS = Array.from({length: 24}, (_, index) => `seed-${index}`)
const NETWORK_ORIGIN = Symbol('stress-network')

type StressClient = ReturnType<typeof createStressClient>

class SeededRandom {
  constructor(private state: number) {}

  next(): number {
    this.state |= 0
    this.state = this.state + 0x6D2B79F5 | 0
    let value = Math.imul(this.state ^ this.state >>> 15, 1 | this.state)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }

  int(max: number): number {
    return max <= 1 ? 0 : Math.floor(this.next() * max)
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]
  }
}

type NetworkPacket = {
  readonly from: number
  readonly update: Uint8Array
  readonly pendingRecipients: Set<number>
}

class SimulatedNetwork {
  private readonly packets: NetworkPacket[] = []
  private readonly online: boolean[]
  private readonly handlers: Array<(
    update: Uint8Array,
    origin: unknown,
    doc: Y.Doc,
    transaction: Y.Transaction,
  ) => void> = []

  constructor(
    private readonly clients: readonly StressClient[],
    private readonly random: SeededRandom,
  ) {
    this.online = clients.map(() => true)
    clients.forEach((client, from) => {
      const handler = (
        update: Uint8Array,
        _origin: unknown,
        _doc: Y.Doc,
        transaction: Y.Transaction,
      ) => {
        if (!transaction.local) return
        this.packets.push({
          from,
          update: new Uint8Array(update),
          pendingRecipients: new Set(
            clients.map((_, index) => index).filter(index => index !== from),
          ),
        })
      }
      this.handlers.push(handler)
      client.yDoc.on('update', handler)
    })
  }

  get pendingDeliveryCount(): number {
    return this.packets.reduce((count, packet) => count + packet.pendingRecipients.size, 0)
  }

  toggle(clientIndex: number): void {
    this.online[clientIndex] = !this.online[clientIndex]
  }

  bringAllOnline(): void {
    this.online.fill(true)
  }

  deliverOne(): boolean {
    const deliverable: Array<{packet: NetworkPacket, recipient: number}> = []
    for (const packet of this.packets) {
      if (!this.online[packet.from]) continue
      packet.pendingRecipients.forEach(recipient => {
        if (this.online[recipient]) deliverable.push({packet, recipient})
      })
    }
    if (!deliverable.length) return false

    const {packet, recipient} = this.random.pick(deliverable)
    Y.applyUpdate(this.clients[recipient].yDoc, packet.update, NETWORK_ORIGIN)
    if (this.random.chance(0.03)) {
      // At-least-once transports may redeliver an update. Yjs must absorb it.
      Y.applyUpdate(this.clients[recipient].yDoc, packet.update, NETWORK_ORIGIN)
    }
    packet.pendingRecipients.delete(recipient)
    const index = this.packets.indexOf(packet)
    if (!packet.pendingRecipients.size && index >= 0) this.packets.splice(index, 1)
    return true
  }

  async drain(): Promise<void> {
    this.bringAllOnline()
    let deliveries = 0
    for (let round = 0; round < 200; round++) {
      while (this.deliverOne()) {
        deliveries++
        if (deliveries > 100_000) {
          throw new Error('simulated collaboration network did not quiesce')
        }
      }
      await settleRepairMicrotasks()
      if (!this.pendingDeliveryCount) {
        await settleRepairMicrotasks()
        if (!this.pendingDeliveryCount) return
      }
    }
    throw new Error(`simulated network still has ${this.pendingDeliveryCount} deliveries`)
  }

  destroy(): void {
    this.clients.forEach((client, index) => {
      client.yDoc.off('update', this.handlers[index])
    })
    this.packets.length = 0
  }
}

function deterministicClientId(seed: number, index: number): number {
  const mixed = (seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0
  return mixed || index + 1
}

function createSeedUpdate(clientId?: number): Uint8Array {
  const yDoc = new Y.Doc()
  if (clientId !== undefined) yDoc.clientID = clientId
  const blocks = yDoc.getMap<YBlock>('blocks')
  yDoc.transact(() => {
    blocks.set(ROOT_ID, createContainerYBlock(
      ROOT_ID,
      'root',
      BlockNodeType.root,
      [...PARENT_IDS],
    ))
    PARENT_IDS.forEach((parentId, parentIndex) => {
      blocks.set(parentId, createContainerYBlock(
        parentId,
        'callout',
        BlockNodeType.block,
        INITIAL_BLOCK_IDS.filter((_, index) => index % PARENT_IDS.length === parentIndex),
      ))
    })
    INITIAL_BLOCK_IDS.forEach((blockId, index) => {
      blocks.set(blockId, createEditableYBlock(blockId, `seed:${index}`))
    })
  })
  const update = Y.encodeStateAsUpdate(yDoc)
  yDoc.destroy()
  return update
}

function createContainerYBlock(
  id: string,
  flavour: string,
  nodeType: BlockNodeType,
  children: string[],
): YBlock {
  return native2YBlock({
    id,
    flavour,
    nodeType,
    props: {},
    meta: {},
    children,
  } as NativeBlockModel)
}

function createEditableYBlock(id: string, text: string): YBlock {
  return native2YBlock({
    id,
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {depth: 0},
    meta: {},
    children: text ? [{insert: text}] : [],
  } as NativeBlockModel)
}

function createStressClient(index: number, seedUpdate: Uint8Array, clientId?: number) {
  const yDoc = new Y.Doc({gc: false})
  if (clientId !== undefined) yDoc.clientID = clientId
  const yBlockMap = yDoc.getMap<YBlock>('blocks')
  Y.applyUpdate(yDoc, seedUpdate, NETWORK_ORIGIN)
  const warnings: string[] = []
  const destroyCallbacks: Array<() => void> = []
  const selectionChange$ = new BehaviorSubject<null>(null)
  const onDestroy$ = new Subject<void>()

  const selection = {
    value: null,
    selectionChange$,
    changeObserve: () => selectionChange$.asObservable(),
    replay: (value: null) => selectionChange$.next(value),
    restoreBookmark: () => {},
  }
  const vm = {
    usesSparseRoot: true,
    get: (_id: string) => undefined,
    isMounted: (_id: string) => false,
    deleteByIds: (_ids: string[]) => {},
    destroy: (_id: string) => {},
    createComponentByYBlocks: (_blocks: Record<string, YBlock>) => ({}),
    insert: () => {},
    retainRootChild: (_id: string) => undefined,
    retainComponentSubtree: () => {},
    applySparseRootChildrenDelta: () => {},
    _reconcileSparseRootChildren: (_ids: readonly string[]) => {},
  }
  const readonlyManager = {
    assertTextWritable: () => {},
    assertPropsWritable: () => {},
    assertInsertable: () => {},
    assertRemovable: () => {},
    assertMovable: () => {},
    assertUndoRedoWritable: () => {},
    runSystemRepair: <T>(fn: () => T) => fn(),
  }
  const doc: any = {
    yDoc,
    yBlockMap,
    rootId: ROOT_ID,
    root: {id: ROOT_ID},
    isInitialized: true,
    isReadonly: false,
    config: {readonly: false},
    logger: {
      warn: (...args: unknown[]) => warnings.push(args.map(formatWarningPart).join(' ')),
    },
    ngZone: {run: <T>(fn: () => T) => fn()},
    vm,
    selection,
    readonlyManager,
    inputManger: {
      compositionSession: {
        shouldDeferPatch: () => false,
        deferPatch: () => {},
        handleBlocksDeleted: () => {},
      },
    },
    isEditable: () => false,
    afterInit: (fn: (root: {id: string}) => void) => fn({id: ROOT_ID}),
    onDestroy$,
    onDestroy: (fn: () => void) => destroyCallbacks.push(fn),
  }

  const model = new BlockModelGraph(doc)
  doc.model = model
  model.build(ROOT_ID)
  const crud = new DocCRUD(doc)
  doc.crud = crud

  const destroy = () => {
    destroyCallbacks.forEach(fn => fn())
    model.destroy()
    selectionChange$.complete()
    onDestroy$.complete()
    yDoc.destroy()
  }

  return {index, yDoc, yBlockMap, model, crud, warnings, destroy}
}

function formatWarningPart(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function childrenOf(client: StressClient, parentId: string): Y.Array<string> {
  const children = client.yBlockMap.get(parentId)?.get('children')
  if (!(children instanceof Y.Array)) throw new Error(`missing container ${parentId}`)
  return children
}

function ownerIds(client: StressClient, blockId: string): string[] {
  return PARENT_IDS.filter(parentId => childrenOf(client, parentId).toArray().includes(blockId))
}

function editableIds(client: StressClient): string[] {
  const ids: string[] = []
  client.yBlockMap.forEach((block, id) => {
    if (block.get('nodeType') === BlockNodeType.editable && ownerIds(client, id).length === 1) {
      ids.push(id)
    }
  })
  return ids.sort()
}

function moveBlock(client: StressClient, blockId: string, targetId: string): boolean {
  const owners = ownerIds(client, blockId)
  if (owners.length !== 1 || owners[0] === targetId || !client.yBlockMap.has(blockId)) return false
  const source = childrenOf(client, owners[0])
  const sourceIndex = source.toArray().indexOf(blockId)
  if (sourceIndex < 0) return false
  const target = childrenOf(client, targetId)
  client.crud.undoManager.stopCapturing()
  client.crud.transact(() => {
    source.delete(sourceIndex, 1)
    target.insert(target.length, [blockId])
  })
  return true
}

function deleteBlock(client: StressClient, blockId: string): boolean {
  const owners = ownerIds(client, blockId)
  if (owners.length !== 1 || !client.yBlockMap.has(blockId)) return false
  const source = childrenOf(client, owners[0])
  const sourceIndex = source.toArray().indexOf(blockId)
  if (sourceIndex < 0) return false
  client.crud.undoManager.stopCapturing()
  client.crud.transact(() => {
    client.yBlockMap.delete(blockId)
    source.delete(sourceIndex, 1)
  })
  return true
}

function createBlock(
  client: StressClient,
  blockId: string,
  parentId: string,
  text: string,
): void {
  const target = childrenOf(client, parentId)
  client.crud.undoManager.stopCapturing()
  client.crud.transact(() => {
    client.yBlockMap.set(blockId, createEditableYBlock(blockId, text))
    target.insert(target.length, [blockId])
  })
}

function editText(client: StressClient, blockId: string, random: SeededRandom): boolean {
  const block = client.yBlockMap.get(blockId)
  const text = block?.get('children')
  if (!(text instanceof Y.Text) || ownerIds(client, blockId).length !== 1) return false
  client.crud.undoManager.stopCapturing()
  client.crud.transact(() => {
    if (text.length && random.chance(0.28)) {
      text.delete(random.int(text.length), 1)
    } else {
      text.insert(random.int(text.length + 1), String.fromCharCode(97 + client.index))
    }
  })
  return true
}

function updateProps(client: StressClient, blockId: string, revision: number): boolean {
  const props = client.yBlockMap.get(blockId)?.get('props')
  if (!(props instanceof Y.Map) || ownerIds(client, blockId).length !== 1) return false
  client.crud.undoManager.stopCapturing()
  client.crud.transact(() => props.set(`client-${client.index}`, revision))
  return true
}

function performRandomOperation(
  client: StressClient,
  random: SeededRandom,
  counters: number[],
  revision: number,
): void {
  const ids = editableIds(client)
  const roll = random.next()
  if (roll < 0.34 && ids.length) {
    editText(client, random.pick(ids), random)
  } else if (roll < 0.59 && ids.length) {
    const blockId = random.pick(ids)
    const currentOwner = ownerIds(client, blockId)[0]
    const targets = PARENT_IDS.filter(parentId => parentId !== currentOwner)
    moveBlock(client, blockId, random.pick(targets))
  } else if (roll < 0.69) {
    const blockId = `client-${client.index}-new-${counters[client.index]++}`
    createBlock(client, blockId, random.pick(PARENT_IDS), `new:${revision}`)
  } else if (roll < 0.77 && ids.length > 8) {
    deleteBlock(client, random.pick(ids))
  } else if (roll < 0.85 && ids.length) {
    updateProps(client, random.pick(ids), revision)
  } else if (roll < 0.95) {
    client.crud.undoManager.undo()
  } else {
    client.crud.undoManager.redo()
  }
}

async function settleRepairMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

function canonicalState(client: StressClient): string {
  const blocks = [...client.yBlockMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, block]) => {
      const children = block.get('children')
      return {
        id,
        flavour: block.get('flavour'),
        nodeType: block.get('nodeType'),
        props: stableValue((block.get('props') as Y.Map<unknown>).toJSON()),
        meta: stableValue((block.get('meta') as Y.Map<unknown>).toJSON()),
        children: children instanceof Y.Text
          ? stableValue(children.toDelta())
          : (children as Y.Array<string>).toArray(),
      }
    })
  return JSON.stringify(blocks)
}

function assertClientInvariants(client: StressClient, seed: number): void {
  const context = `seed=${seed}, client=${client.index}`
  expect(childrenOf(client, ROOT_ID).toArray()).withContext(`${context} root children`)
    .toEqual([...PARENT_IDS])

  const owners = new Map<string, string>()
  PARENT_IDS.forEach(parentId => {
    const childIds = childrenOf(client, parentId).toArray()
    expect(new Set(childIds).size).withContext(`${context} duplicate in ${parentId}`)
      .toBe(childIds.length)
    childIds.forEach(blockId => {
      expect(client.yBlockMap.has(blockId)).withContext(`${context} dangling ${parentId} -> ${blockId}`)
        .toBeTrue()
      expect(owners.has(blockId)).withContext(`${context} duplicate owner for ${blockId}`)
        .toBeFalse()
      owners.set(blockId, parentId)
      expect(client.model.exists(blockId)).withContext(`${context} model missing ${blockId}`)
        .toBeTrue()
      expect(client.model.getParentId(blockId)).withContext(`${context} model owner ${blockId}`)
        .toBe(parentId)
    })
  })

  client.yBlockMap.forEach((block, blockId) => {
    if (block.get('nodeType') !== BlockNodeType.editable) return
    expect(owners.get(blockId)).withContext(`${context} orphan editable ${blockId}`)
      .toBeDefined()
  })

  const unexpectedWarnings = client.warnings.filter(message =>
    /syncYEvent: skip broken event|children repair failed|applyDeltaToView error|Block not found|Cannot read properties/i
      .test(message),
  )
  expect(unexpectedWarnings).withContext(`${context} unexpected warnings`).toEqual([])
}

async function runStressScenario(
  seed: number,
  clientCount = 8,
  operationCount = 320,
): Promise<void> {
  const random = new SeededRandom(seed)
  const seedUpdate = createSeedUpdate(deterministicClientId(seed, clientCount))
  const clients = Array.from(
    {length: clientCount},
    (_, index) => createStressClient(index, seedUpdate, deterministicClientId(seed, index)),
  )
  const network = new SimulatedNetwork(clients, random)
  const counters = clients.map(() => 0)

  try {
    // Deterministic conflict prelude: one block gets three concurrent owners;
    // another is concurrently moved and deleted, producing a dangling edge.
    moveBlock(clients[0], 'seed-0', 'parent-b')
    moveBlock(clients[1], 'seed-0', 'parent-c')
    moveBlock(clients[2], 'seed-0', 'parent-d')
    deleteBlock(clients[3], 'seed-1')
    moveBlock(clients[4], 'seed-1', 'parent-d')
    editText(clients[5], 'seed-2', random)
    editText(clients[6], 'seed-2', random)

    for (let index = 0; index < 24; index++) network.deliverOne()
    await settleRepairMicrotasks()

    for (let revision = 0; revision < operationCount; revision++) {
      const client = random.pick(clients)
      performRandomOperation(client, random, counters, revision)

      if (random.chance(0.08)) network.toggle(random.int(clients.length))
      const deliveries = random.int(6)
      for (let index = 0; index < deliveries; index++) network.deliverOne()
      if (revision % 16 === 15) await settleRepairMicrotasks()
    }

    await network.drain()
    const expectedState = canonicalState(clients[0])
    const expectedVector = [...Y.encodeStateVector(clients[0].yDoc)]
    clients.forEach(client => {
      assertClientInvariants(client, seed)
      expect(canonicalState(client)).withContext(`seed=${seed}, client=${client.index} snapshot`)
        .toBe(expectedState)
      expect([...Y.encodeStateVector(client.yDoc)])
        .withContext(`seed=${seed}, client=${client.index} state vector`)
        .toEqual(expectedVector)
    })
    expect(clients.some(client =>
      client.warnings.some(message => /children repair: fixed/i.test(message)),
    )).withContext(`seed=${seed} exercised children repair`).toBeTrue()
  } finally {
    network.destroy()
    clients.forEach(client => client.destroy())
  }
}

interface NestedOracleNode {
  readonly id: string
  readonly parentId: string | null
  readonly children: readonly string[]
  readonly path: readonly string[]
  readonly nodeType: BlockNodeType
}

function readNestedOracle(client: StressClient): Map<string, NestedOracleNode> {
  const nodes = new Map<string, NestedOracleNode>()
  const visit = (id: string, parentId: string | null, path: readonly string[]) => {
    if (nodes.has(id)) {
      throw new Error(`client=${client.index}: duplicate or cyclic child ${id}`)
    }
    const block = client.yBlockMap.get(id)
    if (!block) {
      throw new Error(`client=${client.index}: dangling child ${parentId ?? 'root'} -> ${id}`)
    }
    const childrenValue = block.get('children')
    const children = childrenValue instanceof Y.Array
      ? childrenValue.toArray()
      : []
    const nextPath = [...path, id]
    const nodeType = block.get('nodeType')
    nodes.set(id, {id, parentId, children, path: nextPath, nodeType})
    children.forEach(childId => visit(childId, id, nextPath))
  }
  visit(ROOT_ID, null, [])
  return nodes
}

function assertNestedClientInvariants(
  client: StressClient,
  context: string,
  checkWarnings = false,
): void {
  const oracle = readNestedOracle(client)
  const allIds = [...client.yBlockMap.keys()].sort()
  for (const id of allIds) {
    const expected = oracle.get(id)
    const actual = {
      exists: client.model.exists(id),
      parentId: client.model.getParentId(id),
      children: [...client.model.getChildrenIds(id)],
      path: client.model.getPath(id),
      index: client.model.indexInParent(id),
    }
    const expectedProjection = expected
      ? {
          exists: true,
          parentId: expected.parentId,
          children: [...expected.children],
          path: [...expected.path],
          index: expected.parentId === null
            ? -1
            : oracle.get(expected.parentId)!.children.indexOf(id),
        }
      : {
          exists: false,
          parentId: null,
          children: [],
          path: null,
          index: -1,
    }
    if (JSON.stringify(actual) !== JSON.stringify(expectedProjection)) {
      const relatedIds = new Set([
        ...actual.children,
        ...expectedProjection.children,
      ])
      const related = [...relatedIds].map(childId => ({
        childId,
        rawOwners: allIds.filter(parentId => {
          const parentChildren = client.yBlockMap.get(parentId)?.get('children')
          return parentChildren instanceof Y.Array &&
            parentChildren.toArray().includes(childId)
        }),
        modelOwner: client.model.getParentId(childId),
        modelPath: client.model.getPath(childId),
      }))
      throw new Error(
        `${context}, client=${client.index}, block=${id}\n` +
        `expected=${JSON.stringify(expectedProjection)}\n` +
        `actual=${JSON.stringify(actual)}\n` +
        `related=${JSON.stringify(related)}`,
      )
    }
  }

  // Concurrent ancestor deletion and descendant creation can leave CRDT data
  // without a root path. It cannot be safely collected without transport-level
  // quiescence, so the observable contract is that the model graph hides it.
  const exposedUnreachableIds = allIds.filter(id =>
    !oracle.has(id) && client.model.exists(id),
  )
  expect(exposedUnreachableIds)
    .withContext(`${context}, client=${client.index} exposed unreachable blocks`)
    .toEqual([])

  if (!checkWarnings) return
  const unexpectedWarnings = client.warnings.filter(message =>
    /syncYEvent: skip broken event|children repair failed|applyDeltaToView error|Block not found|Cannot read properties/i
      .test(message),
  )
  expect(unexpectedWarnings)
    .withContext(`${context}, client=${client.index} unexpected warnings`)
    .toEqual([])
}

function nestedTransact(client: StressClient, fn: () => void): void {
  client.crud.undoManager.stopCapturing()
  client.crud.transact(fn)
}

function wrapKnownChildren(
  client: StressClient,
  parentId: string,
  start: number,
  count: number,
  wrapperId: string,
): boolean {
  const parentChildren = childrenOf(client, parentId)
  const moved = parentChildren.toArray().slice(start, start + count)
  if (!moved.length) return false
  nestedTransact(client, () => {
    client.yBlockMap.set(
      wrapperId,
      createContainerYBlock(wrapperId, 'callout', BlockNodeType.block, moved),
    )
    parentChildren.delete(start, moved.length)
    parentChildren.insert(start, [wrapperId])
  })
  return true
}

function nestedDescendants(
  oracle: ReadonlyMap<string, NestedOracleNode>,
  blockId: string,
): string[] {
  const ids: string[] = []
  const visit = (id: string) => {
    oracle.get(id)?.children.forEach(visit)
    ids.push(id)
  }
  visit(blockId)
  return ids
}

function performNestedOperation(
  client: StressClient,
  random: SeededRandom,
  counters: number[],
  revision: number,
): string {
  const oracle = readNestedOracle(client)
  const containers = [...oracle.values()].filter(node =>
    node.nodeType !== BlockNodeType.editable &&
    node.nodeType !== BlockNodeType.void,
  )
  const editable = [...oracle.values()].filter(node =>
    node.nodeType === BlockNodeType.editable && node.parentId !== null,
  )
  const nextId = (kind: 'container' | 'leaf') =>
    `nested-${kind}-${client.index}-${counters[client.index]++}`

  const edit = () => {
    if (!editable.length) return false
    const node = random.pick(editable)
    const text = client.yBlockMap.get(node.id)?.get('children')
    if (!(text instanceof Y.Text)) return false
    nestedTransact(client, () => {
      if (text.length && random.chance(0.28)) {
        text.delete(random.int(text.length), 1)
      } else {
        text.insert(random.int(text.length + 1), String.fromCharCode(97 + client.index))
      }
    })
    return true
  }

  const moveLeaf = () => {
    if (!editable.length) return false
    const node = random.pick(editable)
    const targets = containers.filter(container => container.id !== node.parentId)
    if (!targets.length) return false
    const target = random.pick(targets)
    const sourceChildren = childrenOf(client, node.parentId!)
    const sourceIndex = sourceChildren.toArray().indexOf(node.id)
    if (sourceIndex < 0) return false
    nestedTransact(client, () => {
      sourceChildren.delete(sourceIndex, 1)
      const targetChildren = childrenOf(client, target.id)
      targetChildren.insert(random.int(targetChildren.length + 1), [node.id])
    })
    return true
  }

  const wrap = () => {
    const parents = containers.filter(node => node.children.length > 0)
    if (!parents.length || oracle.size >= 100) return false
    const parent = random.pick(parents)
    const start = random.int(parent.children.length)
    const count = 1 + random.int(Math.min(3, parent.children.length - start))
    return wrapKnownChildren(client, parent.id, start, count, nextId('container'))
  }

  const unwrap = () => {
    const candidates = containers.filter(node => node.parentId !== null)
    if (!candidates.length) return false
    const container = random.pick(candidates)
    const parentChildren = childrenOf(client, container.parentId!)
    const index = parentChildren.toArray().indexOf(container.id)
    if (index < 0) return false
    nestedTransact(client, () => {
      parentChildren.delete(index, 1)
      if (container.children.length) {
        parentChildren.insert(index, [...container.children])
      }
      client.yBlockMap.delete(container.id)
    })
    return true
  }

  const insertLeaf = () => {
    if (!containers.length || oracle.size >= 100) return false
    const parent = random.pick(containers)
    const id = nextId('leaf')
    nestedTransact(client, () => {
      client.yBlockMap.set(id, createEditableYBlock(id, `nested:${revision}`))
      const target = childrenOf(client, parent.id)
      target.insert(random.int(target.length + 1), [id])
    })
    return true
  }

  const deleteLeaf = () => {
    if (editable.length <= 12) return false
    const leaf = random.pick(editable)
    const parentChildren = childrenOf(client, leaf.parentId!)
    const index = parentChildren.toArray().indexOf(leaf.id)
    if (index < 0) return false
    nestedTransact(client, () => {
      parentChildren.delete(index, 1)
      client.yBlockMap.delete(leaf.id)
    })
    return true
  }

  const deleteSubtree = () => {
    const candidates = containers.filter(node => {
      if (node.parentId === null) return false
      const subtree = nestedDescendants(oracle, node.id)
      const removedEditable = subtree.filter(id =>
        oracle.get(id)?.nodeType === BlockNodeType.editable
      ).length
      return editable.length - removedEditable >= 12
    })
    if (!candidates.length) return false
    const node = random.pick(candidates)
    const parentChildren = childrenOf(client, node.parentId!)
    const index = parentChildren.toArray().indexOf(node.id)
    if (index < 0) return false
    const subtree = nestedDescendants(oracle, node.id)
    nestedTransact(client, () => {
      parentChildren.delete(index, 1)
      subtree.forEach(id => client.yBlockMap.delete(id))
    })
    return true
  }

  const updateNestedProps = () => {
    if (!editable.length) return false
    const node = random.pick(editable)
    const props = client.yBlockMap.get(node.id)?.get('props')
    if (!(props instanceof Y.Map)) return false
    nestedTransact(client, () => props.set(`nested-${client.index}`, revision))
    return true
  }

  const roll = random.next()
  if (roll < 0.22) return `edit:${edit()}`
  if (roll < 0.40) return `move-leaf:${moveLeaf()}`
  if (roll < 0.54) return `wrap:${wrap()}`
  if (roll < 0.64) return `unwrap:${unwrap()}`
  if (roll < 0.72) return `insert:${insertLeaf()}`
  if (roll < 0.78) return `delete-leaf:${deleteLeaf()}`
  if (roll < 0.83) return `delete-subtree:${deleteSubtree()}`
  if (roll < 0.88) return `props:${updateNestedProps()}`
  if (roll < 0.96) {
    client.crud.undoManager.undo()
    return 'undo'
  }
  client.crud.undoManager.redo()
  return 'redo'
}

async function runNestedCollaborationStress(
  seed: number,
  clientCount = 8,
  operationCount = 600,
): Promise<void> {
  const random = new SeededRandom(seed)
  const seedUpdate = createSeedUpdate(deterministicClientId(seed, clientCount))
  const clients = Array.from(
    {length: clientCount},
    (_, index) => createStressClient(index, seedUpdate, deterministicClientId(seed, index)),
  )
  const network = new SimulatedNetwork(clients, random)
  const counters = clients.map(() => 0)
  const operationTrace: string[] = []

  try {
    // Every client starts from a valid local tree. These concurrent operations
    // intentionally merge into duplicate owners and dangling references.
    wrapKnownChildren(clients[0], 'parent-a', 0, 2, 'prelude-wrapper-a')
    wrapKnownChildren(clients[1], 'parent-a', 0, 2, 'prelude-wrapper-b')
    moveBlock(clients[2], 'seed-0', 'parent-b')
    deleteBlock(clients[3], 'seed-4')
    wrapKnownChildren(clients[4], 'parent-b', 0, 3, 'prelude-wrapper-c')
    moveBlock(clients[5], 'seed-1', 'parent-c')
    wrapKnownChildren(clients[6], 'parent-a', 2, 2, 'prelude-wrapper-d')
    moveBlock(clients[7], 'seed-8', 'parent-d')

    for (let index = 0; index < 36; index++) network.deliverOne()
    await settleRepairMicrotasks()

    for (let revision = 0; revision < operationCount; revision++) {
      const client = random.pick(clients)
      const operation = performNestedOperation(client, random, counters, revision)
      operationTrace.push(`${revision}:c${client.index}:${operation}`)

      if (random.chance(0.07)) network.toggle(random.int(clients.length))
      const deliveries = random.int(7)
      for (let index = 0; index < deliveries; index++) network.deliverOne()
      await settleRepairMicrotasks()

      if (revision % 24 === 23) {
        clients.forEach(current => {
          assertNestedClientInvariants(
            current,
            `seed=${seed}, revision=${revision}, trace=${operationTrace.slice(-8).join(' > ')}`,
          )
        })
      }
    }

    await network.drain()
    const expectedState = canonicalState(clients[0])
    const expectedVector = [...Y.encodeStateVector(clients[0].yDoc)]
    clients.forEach(client => {
      assertNestedClientInvariants(client, `seed=${seed}, final`, true)
      expect(canonicalState(client))
        .withContext(`seed=${seed}, client=${client.index} nested snapshot`)
        .toBe(expectedState)
      expect([...Y.encodeStateVector(client.yDoc)])
        .withContext(`seed=${seed}, client=${client.index} nested state vector`)
        .toEqual(expectedVector)
    })
    expect(clients.some(client =>
      client.warnings.some(message => /children repair: fixed/i.test(message)),
    )).withContext(`seed=${seed} exercised nested children repair`).toBeTrue()
  } finally {
    network.destroy()
    clients.forEach(client => client.destroy())
  }
}

describe('multi-client collaboration stress', () => {
  for (const seed of [0xC0FFEE, 0x51EC710]) {
    it(`converges under delayed, duplicated and reordered updates (seed ${seed})`, async () => {
      await runStressScenario(seed)
    }, 30_000)
  }

  it('survives a 16-client sustained collaboration soak', async () => {
    await runStressScenario(0x16C011AB, 16, 1_200)
  }, 30_000)

  for (const seed of [0xC011AB1E, 0x51EC710, 0xB10C6A7]) {
    it(`converges through dynamic nested structure churn (seed ${seed})`, async () => {
      await runNestedCollaborationStress(seed)
    }, 45_000)
  }
})
