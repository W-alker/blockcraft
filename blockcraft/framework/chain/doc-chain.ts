import { nextTick } from "../../global"
import { IBlockSnapshot } from "../block-std"
import { IBlockInlineRangeJSON } from "../modules"

export interface DocChainContext {
  doc: BlockCraft.Doc
  lastResult: unknown
  results: unknown[]
}

type DocChainTask = (context: DocChainContext) => Promise<unknown> | unknown

export class DocChain {

  private readonly tasks: DocChainTask[] = []
  private _lastResult: unknown = undefined

  constructor(public readonly doc: BlockCraft.Doc) {
  }

  get lastResult() {
    return this._lastResult
  }

  /**
   * Queue a custom task into the chain.
   */
  task<T = unknown>(executor: (doc: BlockCraft.Doc, lastResult: unknown) => Promise<T> | T) {
    return this.push(context => executor(context.doc, context.lastResult))
  }

  /**
   * Run synchronous mutations inside one Y transaction.
   */
  transact<T = unknown>(executor: (doc: BlockCraft.Doc, lastResult: unknown) => T, origin: any = null) {
    return this.push(context => this.doc.crud.transact(() => executor(context.doc, context.lastResult), origin))
  }

  /**
   * Run side effects while preserving `lastResult`.
   */
  tap(handler: (context: Readonly<DocChainContext>) => Promise<void> | void) {
    return this.push(async context => {
      await handler({
        doc: context.doc,
        lastResult: context.lastResult,
        results: [...context.results]
      })
      return context.lastResult
    })
  }

  nextTick() {
    return this.push(async context => {
      await nextTick()
      return context.lastResult
    })
  }

  animationFrame() {
    return this.push(context => new Promise(resolve => {
      requestAnimationFrame(() => resolve(context.lastResult))
    }))
  }

  snapshot<T extends BlockCraft.BlockFlavour>(flavour: T, ...params: BlockCraft.BlockCreateParameters<T>) {
    return this.doc.schemas.createSnapshot(flavour, params as BlockCraft.BlockCreateParameters<T>)
  }

  insertSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]) {
    return this.push(() => this.doc.crud.insertBlocks(parentId, index, snapshots))
  }

  insert<T extends BlockCraft.BlockFlavour>(parentId: string, index: number, flavour: T, ...params: BlockCraft.BlockCreateParameters<T>) {
    return this.push(() => {
      const snapshot = this.doc.schemas.createSnapshot(flavour, params as BlockCraft.BlockCreateParameters<T>)
      return this.doc.crud.insertBlocks(parentId, index, [snapshot])
    })
  }

  insertBeforeSnapshots(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    return this.push(() => this.doc.crud.insertBlocksBefore(block, snapshots))
  }

  insertBefore<T extends BlockCraft.BlockFlavour>(block: string | BlockCraft.BlockComponent, flavour: T, ...params: BlockCraft.BlockCreateParameters<T>) {
    return this.push(() => {
      const snapshot = this.doc.schemas.createSnapshot(flavour, params as BlockCraft.BlockCreateParameters<T>)
      return this.doc.crud.insertBlocksBefore(block, [snapshot])
    })
  }

  insertAfterSnapshots(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    return this.push(() => this.doc.crud.insertBlocksAfter(block, snapshots))
  }

  insertAfter<T extends BlockCraft.BlockFlavour>(block: string | BlockCraft.BlockComponent, flavour: T, ...params: BlockCraft.BlockCreateParameters<T>) {
    return this.push(() => {
      const snapshot = this.doc.schemas.createSnapshot(flavour, params as BlockCraft.BlockCreateParameters<T>)
      return this.doc.crud.insertBlocksAfter(block, [snapshot])
    })
  }

  replaceWithSnapshots(blockId: string, snapshots: IBlockSnapshot[]) {
    return this.push(() => this.doc.crud.replaceWithSnapshots(blockId, snapshots))
  }

  replaceWith<T extends BlockCraft.BlockFlavour>(blockId: string, flavour: T, ...params: BlockCraft.BlockCreateParameters<T>) {
    return this.push(() => {
      const snapshot = this.doc.schemas.createSnapshot(flavour, params as BlockCraft.BlockCreateParameters<T>)
      return this.doc.crud.replaceWithSnapshots(blockId, [snapshot])
    })
  }

  deleteBlocks(parentId: string, index: number, count = 1, force = false) {
    return this.push(() => this.doc.crud.deleteBlocks(parentId, index, count, force))
  }

  deleteById(blockId: string) {
    return this.push(() => this.doc.crud.deleteBlockById(blockId))
  }

  move(parentId: string, index: number, count: number, targetId: string, targetIndex: number) {
    return this.push(() => this.doc.crud.moveBlocks(parentId, index, count, targetId, targetIndex))
  }

  selectBlock(block: string | BlockCraft.BlockComponent) {
    return this.tap(() => {
      this.doc.selection.selectBlock(block)
    })
  }

  setSelection(from: IBlockInlineRangeJSON, to: IBlockInlineRangeJSON | null = null) {
    return this.tap(() => {
      this.doc.selection.setSelection(from, to)
    })
  }

  selectOrSetCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    return this.tap(() => {
      this.doc.selection.selectOrSetCursorAtBlock(block, atStart, scrollIntoView)
    })
  }

  setCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    return this.tap(() => {
      this.doc.selection.setCursorAtBlock(block, atStart, scrollIntoView)
    })
  }

  recalculateSelection(execNext = true, options?: { isComposing?: boolean }) {
    return this.tap(() => {
      this.doc.selection.recalculate(execNext, options)
    })
  }

  async run() {
    const context: DocChainContext = {
      doc: this.doc,
      lastResult: this._lastResult,
      results: []
    }
    const pendingTasks = this.tasks.splice(0, this.tasks.length)

    for (const task of pendingTasks) {
      context.lastResult = await task(context)
      context.results.push(context.lastResult)
    }

    this._lastResult = context.lastResult
    return {
      lastResult: context.lastResult,
      results: context.results
    }
  }

  private push(task: DocChainTask) {
    this.tasks.push(task)
    return this
  }
}

export const chainDoc = (doc: BlockCraft.Doc) => new DocChain(doc)
