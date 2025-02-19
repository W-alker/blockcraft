import {DeltaOperation, IBlockSnapshot} from "../types";
import {YBlock} from "../reactive";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode} from "../../global";

// This origin will skip Y.Event sync (to model)
export const ORIGIN_SKIP_SYNC = Symbol('skip_sync')
// This origin will not be recorded in undo/redo stack
export const ORIGIN_NO_RECORD = Symbol('no_record')

export class DocCRUD {

  readonly yDoc = new Y.Doc({
    guid: this.doc.config.docId
  })
  readonly yBlockMap = this.yDoc.getMap<YBlock>()
  readonly yUndoManager = new Y.UndoManager(this.yBlockMap, {
    trackedOrigins: new Set([ORIGIN_SKIP_SYNC, null])
  })

  constructor(
    public readonly doc: BlockCraft.Doc
  ) {
    this.yBlockMap.observeDeep(this._syncYEvent)

    this.yUndoManager.on('stack-item-added', (e) => {
      // console.log('undo/redo stack', e, e.origin)
    })
  }

  get schemas() {
    return this.doc.schemas
  }

  get vm() {
    return this.doc.vm
  }

  transact(fn: () => void, origin: any = null) {
    return this.yDoc.transact(fn, origin)
  }

  private _syncYEvent = (event: Y.YEvent<any>[], tr: Y.Transaction) => {
    // local change with skip
    if (tr.origin === ORIGIN_SKIP_SYNC || tr.origin === ORIGIN_NO_RECORD) return

    // undo/redo
    if (tr.origin instanceof Y.UndoManager) {

    }

    const _bms: Record<string, YBlock> = {}

    // sync to model
    event.forEach(ev => {
      const {path, changes, target} = ev

      console.log('sync YEvent', path, changes, tr.origin)

      // at top level, it`s mean that block is created or deleted
      if (!path.length) {
        changes.keys.forEach((change, key) => {
          switch (change.action) {
            case 'add':
            case "update":
              _bms[key] = this.yBlockMap.get(key)!
              break;
            case 'delete':
              break;
          }
        })

        return
      }

      const blockId = path[0] as string
      const keyProp = path[1]
      if (keyProp === "children") {
        if(target instanceof Y.Array) {
          this._syncYBlockChildrenUpdate(_bms, ev)
        } else {
          const bm = this.vm.get(blockId)
          if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)
          const start = performance.now()
          this.doc.inlineManager.applyDeltaToView(changes.delta as DeltaOperation[], bm.instance as any)
          console.log('apply delta to view', performance.now() - start + 'ms')
        }
        return
      }

      const bm = this.vm.get(blockId)
      if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)
      const propKey = path[1] as 'props' | 'meta'
      changes.keys.forEach((change, key) => {
        switch (change.action) {
          case 'add':
          case "update":
            // @ts-expect-error
            bm.instance._native[propKey][key] = target.get(key)
            break;
          case 'delete':
            // @ts-expect-error
            delete bm.instance._native[propKey][key]
            break;
        }
      })
      // 触发视图检查
      Promise.resolve().then(() => {
        bm.instance.changeDetectorRef.markForCheck()
        bm.instance.onPropsChange.emit(changes.keys)
      })
    })
  }

  private _syncYBlockChildrenUpdate = (collect: Record<string, YBlock>, event: Y.YEvent<Y.Array<string>>) => {
    const {path, changes, target} = event
    let r = 0
    const bm = this.vm.get(path[0] as string)
    if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${path[0]} not found`)

    changes.delta.forEach(async (d) => {
      const {retain, insert, delete: del} = d
      if (retain) {
        r += retain
      } else if (insert) {
        const childComps = await this.vm.createComponentByYBlocks(collect)
        const _insertComps = (insert as string[]).map(id => childComps[id])
        this.vm.insert(bm.instance.id, r, _insertComps)
        r += insert.length
      } else {
        this.vm.remove(bm, r, del)
      }
    })
  }

  async insertBlocks(snapshots: IBlockSnapshot[], index = 0, parentId = this.doc.rootId) {
    const comps = await Promise.all(
      snapshots.map(s => this.vm.createComponentBySnapshot(s, (m) => {
        this.transact(() => {
          this.yBlockMap.set(m.instance.id, m.instance.yBlock)
        }, ORIGIN_SKIP_SYNC)
      }))
    )
    const parentComp = this.vm.get(parentId)!
    this.transact(() => {
      this.vm.insert(parentId, index, comps);
      (parentComp.instance.yBlock.get('children') as Y.Array<string>).insert(index, comps.map(c => c.instance.id))
    }, ORIGIN_SKIP_SYNC)
  }

  async deleteBlocks(parent: string, index: number, count = 1) {
    const parentComp = this.vm.get(parent)!
    this.transact(() => {
      const ids = this.vm.remove(parentComp, index, count);
      (parentComp.instance.yBlock.get('children') as Y.Array<string>).delete(index, count)
      ids.forEach(id => this.yBlockMap.delete(id))
    }, ORIGIN_SKIP_SYNC)
  }

  deleteBlocksByRange(from: string | BlockCraft.BlockComponent, to: string | BlockCraft.BlockComponent) {
    const fromComp = typeof from === 'string' ? this.doc.getBlockById(from) : from
    const toComp = typeof to === 'string' ? this.doc.getBlockById(to) : to
    if (fromComp === toComp) return
    const fromAncestors = this.doc.queryAncestor(fromComp)
    const toAncestors = this.doc.queryAncestor(toComp)
  }

  undo() {
    this.yUndoManager.undo()
  }

  redo() {
    this.yUndoManager.redo()
  }


}
