import Y, {ModelSyncer} from "@core/yjs";
import {IBlockModel} from "@core/types";

export interface InitConfig {
  rootId: string
}

const findByPath = (path: Array<string | number> | null, obj: any): any => {
  let res = obj
  if (!path?.length) return res
  for (let i = 0; i < path.length; i++) {
    res = res[path[i]]
  }
  return res
}

/**
 *  @desc Model data manager
 *  Doc -> Root(Y.Array) -> Block(Y.Map) -> Block.Children(Y.Array) -> Block.Children.Block(Y.Map) -> ...
 */
export class BlockFlowDoc {
  public readonly rootModel: Array<IBlockModel> = []

  public readonly doc: Y.Doc = new Y.Doc({guid: this.config.rootId})
  public readonly rootYModel: Y.Array<Y.Map<any>> = this.doc.getArray(this.config.rootId)
  private readonly flatMapStore: Map<string, { m: IBlockModel, y: Y.Map<any> }> = new Map()

  constructor(private config: InitConfig) {
  }

  get rootId() {
    return this.config.rootId
  }

  toJSON() {
    return this.rootYModel.toJSON()
  }

  applyUpdate(update: Uint8Array) {
    Y.applyUpdate(this.doc, update)
  }

  transact(fn: () => void, origin: any = null) {
    this.doc.transact(fn, origin)
  }

  queryBlockModel(id: string) {
    return this.flatMapStore.get(id)?.m
  }

  queryYBlockModel(id: string) {
    return this.flatMapStore.get(id)?.y
  }

  queryBlockIndexAndParentId(id: string): { index: number, parentId: string } {
    const yMap = this.queryYBlockModel(id)
    if (!yMap) throw new Error(`Can not find block ${id}`)
    const parent = yMap.parent
    if (!parent) throw new Error(`Can not find parent of block ${id}`)
    // root
    if (!parent.parent) {
      return {index: this.rootModel.findIndex(b => b.id === id), parentId: this.rootId}
    }

    const parentId = (parent as Y.Map<any>).get('id')
    const m = this.flatMapStore.get(parentId)!.m
    return {
      index: m.children!.findIndex(b => (b as IBlockModel).id === id),
      parentId
    }
  }

  queryParentId(id: string) {
    const ym = this.queryYBlockModel(id)
    if (!ym) return null
    const parent = ym.parent as Y.Map<any>
    return parent ? parent.get('id') : null
  }

  /**
   * @desc Convert block model to Yjs model and store them
   * @param blocks block model array
   */
  private blocks2Y(blocks: IBlockModel[]) {
    return blocks.map(block => ModelSyncer.blockModel2Y(block,
      (block, yMap) => {
        this.flatMapStore.set(block.id, {
          m: block,
          y: yMap
        })
      }
    ))
  }

  insertBlocks(insertIndex: number, blocks: IBlockModel[], parentId: string) {
    const yBlocks = this.blocks2Y(blocks)
    console.log('insertBlocks', this.flatMapStore)
    if (parentId === this.rootId) {
      this.rootYModel.insert(insertIndex, yBlocks)
      this.rootModel.splice(insertIndex, 0, ...blocks)
      return
    }

    const yb = this.queryYBlockModel(parentId)
    if (!yb) throw new Error(`Can not find block ${parentId}`)
    const bm = this.queryBlockModel(parentId)!
    yb.get('children').insert(insertIndex, yBlocks)
    bm.children?.splice(insertIndex, 0, ...blocks)
    return
  }

  deleteBlocks(deleteIndex: number, numBlocks: number, parentId: string) {
    if (parentId === this.rootId) {
      for (let i = 0; i < numBlocks; i++) {
        const id = this.rootModel[deleteIndex + i].id
        this.flatMapStore.delete(id)
      }
      this.rootYModel.delete(deleteIndex, numBlocks)
      return this.rootModel.splice(deleteIndex, numBlocks)
    } else {
      const bm = this.queryBlockModel(parentId)
      if (!bm) throw new Error(`Can not find block ${parentId}`)
      const yb = this.queryYBlockModel(parentId)
      if (!yb) throw new Error(`Can not find block ${parentId}`)
      for (let i = 0; i < numBlocks; i++) {
        const id = (bm.children as IBlockModel[])![deleteIndex + i].id
        this.flatMapStore.delete(id)
      }
      yb.get('children').delete(deleteIndex, numBlocks)
      return bm.children?.splice(deleteIndex, numBlocks) as IBlockModel[]
    }
  }

  applyYChangeToModel(event: Y.YEvent<any>) {
    const {path, target, changes} = event
    const _t = findByPath(path, this.rootModel)

    if (target instanceof Y.Text) {
      _t.children = target.toDelta()
    } else if (target instanceof Y.Array) {
      this.applyYChangeDeltaToArray(changes.delta as any[], _t)
    } else {
      event.changes.keys.forEach((change, key) => {
        switch (change.action) {
          case 'add':
          case 'update':
            Reflect.set(_t, '_' + key, target.get(key))
            break
          case 'delete':
            Reflect.deleteProperty(_t, '_' + key)
        }
      })
    }
  }

  private applyYChangeDeltaToArray(deltas: Array<{
    insert?: Array<any> | string;
    delete?: number;
    retain?: number;
  }>, array: Array<any>) {
    let retain = 0
    console.log('applyYChangeDeltaToArray', deltas, array)
    deltas.forEach((d) => {
      const {retain: r, insert, delete: del} = d
      if (r) {
        retain += r
      } else if (insert) {
        if (insert instanceof Array) {
          if (insert[0] instanceof Y.Map && insert[0].get('flavour')) {
            const bms = insert.map((v: Y.Map<any>) => v.toJSON()) as IBlockModel[]
            // restore to flatMapStore
            bms.forEach((bm, idx) => {
              // re-proxy block model
              bms[idx] = ModelSyncer.proxy(bm, insert[idx],
                (bmo, ymo) => this.flatMapStore.set(bmo.id, {m: bmo, y: ymo})) as IBlockModel
            })
            Array.prototype.splice.call(array, retain, 0, ...bms)
            retain += bms.length
          } else {
            Array.prototype.splice.call(array, retain, 0, ...insert)
          }
        }
      } else {
        Array.prototype.splice.call(array, retain, del!)
      }
    })
  }

}

