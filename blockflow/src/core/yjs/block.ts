import {DeltaInsert, IBlockModel, IEditableBlockModel, IInlineModel} from "@core";
import {BehaviorSubject, Subject} from "rxjs";
import Y from "@core/yjs";
import {YMapEvent} from "yjs";

export type YBlockModel = Y.Map<any>

const findByPath = (path: Array<string | number> | null, obj: any): any => {
  let res = obj
  if (!path?.length) return res
  for (let i = 0; i < path.length; i++) {
    res = res[path[i]]
  }
  return res
}

export const syncBlockModelChildren = (deltas: Array<{
  insert?: Array<YBlockModel>
  delete?: number;
  retain?: number;
}>, array: Array<BlockModel>) => {
  let r = 0
  deltas.forEach((d) => {
    const {retain, insert, delete: del} = d
    if (retain) {
      r += retain
    } else if (insert) {
      const bms = insert.map(v => BlockModel.fromYModel(v))
      Array.prototype.splice.call(array, r, 0, ...bms)
      r += bms.length
    } else {
      Array.prototype.splice.call(array, r, del!)
    }
  })
}

export const syncMapUpdate = (event: YMapEvent<any>, map: Object, cb?: (e: YMapEvent<any>) => void) => {
  const {path, target, changes} = event
  event.changes.keys.forEach((change, key) => {
    console.log(map, change, target.get(key), path)
    switch (change.action) {
      case 'add':
      case 'update':
        Reflect.set(map, key, target.get(key))
        break
      case 'delete':
        Reflect.deleteProperty(map, key)
    }
    cb && cb(event)
  })
}

export const USER_CHANGE_SIGNAL = Symbol('user-change')

export type UpdateEvent = { type: 'children', event: Y.YArrayEvent<YBlockModel> }
  | { type: 'props', event: YMapEvent<any> }
  | { type: 'meta', event: YMapEvent<any> }

export class BlockModel<Model extends IBlockModel = IBlockModel> {
  readonly update$ = new Subject<UpdateEvent>()

  private _yChildrenObserver = (event: Y.YArrayEvent<YBlockModel>, tr: Y.Transaction) => {
    if (tr.origin === USER_CHANGE_SIGNAL) return
    console.log(`${this._model.id} changed`, event)
    const {path, target, changes} = event
    syncBlockModelChildren(changes.delta as any[], this._childrenModel as BlockModel[])
    this.update$.next({type: 'children', event})
  }

  constructor(private readonly _model: Exclude<IBlockModel, 'children'>,
              public readonly yModel: YBlockModel,
              private readonly _childrenModel?: (BlockModel | IInlineModel)[]) {
    Promise.resolve().then(() => {
      this.setMeta('createdTime', Date.now())
      this.nodeType === 'block' && (this.yModel.get('children') as Y.Array<YBlockModel>).observe(this._yChildrenObserver);
      (this.yModel.get('props') as Y.Map<any>).observe(
        e => syncMapUpdate(e, this.props, e => this.update$.next({type: 'props', event: e}))
      );
      (this.yModel.get('meta') as Y.Map<any>).observe(
        e => syncMapUpdate(e, this.meta, e => this.update$.next({type: 'meta', event: e}))
      )
    })
  }

  static fromYModel(yModel: YBlockModel) {
    const model = yModel.toJSON() as IBlockModel
    let children: (BlockModel | IInlineModel)[]
    const yChildren = yModel.get('children')
    if (yChildren instanceof Y.Text) {
      children = model.children as IInlineModel[]
    } else {
      children = (yChildren as Y.Array<YBlockModel>).map(BlockModel.fromYModel)
    }
    return new BlockModel(model, yModel, children)
  }

  static fromModel<T extends IBlockModel | IEditableBlockModel = IBlockModel>(block: T) {
    console.log('fromModel', block)
    let children: (BlockModel | IInlineModel)[]

    let yChildren
    if (block.nodeType === 'editable') {
      yChildren = new Y.Text()
      block.children.length && yChildren.applyDelta(block.children)
      children = block.children as IInlineModel[]
    } else {
      children = (block.children as IBlockModel[]).map(BlockModel.fromModel)
      yChildren = Y.Array.from((children as BlockModel[]).map(c => c.yModel))
    }

    const yProps = new Y.Map<any>(Object.entries(block.props))
    const yMeta = new Y.Map<any>(Object.entries(block.meta))

    const yModel = new Y.Map<any>([
        ['flavour', block.flavour],
        ['id', block.id],
        ['nodeType', block.nodeType],
        ['props', yProps],
        ['meta', yMeta],
        ['children', yChildren],
      ]
    )
    return new BlockModel<T>(block, yModel, children)
  }

  getParentId() {
    return (this.yModel.parent?.parent as YBlockModel).get('id') as string
  }

  getPosition() {
    const parentChildren = this.yModel.parent as Y.Array<YBlockModel>
    let i = 0
    for (const value of parentChildren) {
      if (value === this.yModel) break
      i++
    }
    if (i >= parentChildren.length) throw new Error('Block not found in parent children')
    const parent = parentChildren.parent as YBlockModel | null
    return {parentId: parent && parent.get('id'), index: i}
  }

  toJSON() {
    return this.yModel.toJSON() as IBlockModel
  }

  get id() {
    return this._model.id
  }

  get flavour() {
    return this._model.flavour
  }

  get nodeType() {
    return this._model.nodeType
  }

  get props() {
    return this._model.props as Readonly<Model['props']>
  }

  get meta() {
    return this._model.meta as Readonly<Model['meta']>
  }

  get children() {
    return this._childrenModel as Model extends IEditableBlockModel ? DeltaInsert[] : BlockModel<Model['children'] extends IEditableBlockModel[] ? IEditableBlockModel : IBlockModel>[]
  }

  getYText() {
    return this.yModel.get('children') as Model extends IEditableBlockModel ? Y.Text : never
  }

  setProps<T extends keyof Model['props']>(key: T, value: Model['props'][T]) {
    this.yModel.doc!.transact(() => {
      this.yModel.get('props').set(key, value)
    })
  }

  setMeta<T extends keyof Model['meta']>(key: T, value: Model['meta'][T]) {
    this.yModel.doc!.transact(() => {
      this.yModel.get('meta').set(key, value)
    })
  }

  private getYChildren() {
    return this.yModel.get('children') as Y.Array<YBlockModel>
  }

  insertChildren(index: number, children: BlockModel[]) {
    if (this.nodeType === 'editable') throw new Error('Editable block cannot have children')
    this.yModel.doc!.transact(() => {
      this.children.splice(index, 0, ...children)
      this.getYChildren().insert(index, children.map(c => c.yModel))
    }, USER_CHANGE_SIGNAL)
  }

  deleteChildren(index: number, num: number) {
    if (this.nodeType === 'editable') throw new Error('Editable block cannot have children')
    this.yModel.doc!.transact(() => {
      this.children.splice(index, num)
      this.getYChildren().delete(index, num)
    }, USER_CHANGE_SIGNAL)
  }

}

