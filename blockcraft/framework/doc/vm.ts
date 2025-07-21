import {ComponentRef, ViewContainerRef} from "@angular/core";
import {take} from "rxjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {
  BlockNodeType,
  IBlockSnapshot,
  BaseBlockComponent,
  YBlock,
  native2YBlock,
  NativeBlockModel,
  yBlock2Native
} from "../block-std";
import * as Y from "yjs";

export class DocVM {

  private _vcr = this.doc.injector.get(ViewContainerRef)
  private store: Map<string, BlockCraft.BlockComponentRef> = new Map()
  private _gcTags = new Set<string>()


  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  get root() {
    return this.doc.root
  }

  get schemas() {
    return this.doc.schemas
  }

  has(id: string) {
    return this.store.has(id)
  }

  set(id: string, component: BlockCraft.BlockComponentRef) {
    this.store.set(id, component)
  }

  get<T extends BlockCraft.BlockFlavour>(id: string) {
    return this.store.get(id) as BlockCraft.BlockComponentRef<T> | undefined
  }

  private _restoreCachedComp(id: string) {
    const cpr = this.store.get(id)!
    cpr.instance.reattach()
    // 子孙元素依次触发reattach
    if (cpr.instance.childrenLength > 0) {
      cpr.instance.getChildrenBlocks().forEach(b => {
        this._restoreCachedComp(b.id)
      })
    }
    if (this._gcTags.has(id)) {
      this._gcTags.delete(id)
    }
    return cpr
  }

  async createComponentByYBlocks(yBlocks: Record<string, YBlock>) {
    // 乱序的，要根据children中的Id顺序组合
    const createComp = (yBlock: YBlock, parentId: string | null = null) => {
      return new Promise<BlockCraft.BlockComponentRef>((resolve, reject) => {
        const id = yBlock.get('id')
        // try get it from cache
        // if (this.has(id)) {
        //   resolve(this._restoreCachedComp(id))
        //   return
        // }

        const schema = this.schemas.get(yBlock.get('flavour'))!
        const cpr = this._vcr.createComponent(schema.component, {
          injector: this.doc.injector
        })
        cpr.setInput('model', yBlock2Native(yBlock))
        cpr.setInput('yBlock', yBlock)
        cpr.setInput('doc', this.doc)
        cpr.instance.parentId = parentId
        // cpr.changeDetectorRef.detectChanges()

        this.set(id, cpr)

        cpr.instance.onViewInit$.pipe(take(1)).subscribe(async () => {
          const yChildren = yBlock.get('children')
          if (yChildren instanceof Y.Array && yChildren.length) {
            for (const childId of yChildren.toArray()) {
              const cmpr = await createComp(yBlocks[childId] || this.doc.crud.getYBlock(childId), id);
              cmpr.changeDetectorRef.detectChanges()
              ;(cpr.instance.childrenContainer as ViewContainerRef).insert(cmpr.hostView)
            }
            resolve(cpr)
            return
          }

          resolve(cpr)
        })
      })
    }

    const res: Record<string, BlockCraft.BlockComponentRef> = {}
    for (const id in yBlocks) {
      res[id] = await createComp(yBlocks[id]!)
    }

    return res
  }

  async createComponentBySnapshot<T extends IBlockSnapshot>(snapshot: T, cb?: (cpr: BlockCraft.BlockComponentRef) => void): Promise<BlockCraft.BlockComponentRef> {

    const createComp = async (snapshot: IBlockSnapshot, parentId: string | null = null) => {

      return new Promise<BlockCraft.BlockComponentRef>((resolve, reject) => {

        // try get it from cache
        // if (this.has(snapshot.id)) {
        //   const cpr = this._restoreCachedComp(snapshot.id)
        //   resolve(cpr)
        //   return
        // }

        const {id, nodeType, flavour, props, meta, children} = snapshot

        const schema = this.schemas.get(flavour)!
        const cpr = this._vcr.createComponent(schema.component, {
          injector: this.doc.injector
        })

        const model = {
          id, nodeType, flavour, props, meta,
          children: (nodeType === BlockNodeType.block || nodeType === BlockNodeType.root) ? children.map(childSnapshot => childSnapshot.id) : children,
        } as NativeBlockModel

        cpr.instance.parentId = parentId
        cpr.setInput('doc', this.doc)
        cpr.setInput('model', model)
        cpr.setInput('yBlock', native2YBlock(model))
        cb && cb(cpr)

        this.set(id, cpr)

        cpr.instance.onViewInit$.pipe(take(1)).subscribe(async () => {
          if (children.length && cpr.instance.childrenContainer) {
            for (const childSnapshot of children) {
              const cmpr = await createComp(childSnapshot as IBlockSnapshot, id);
              cpr.instance.childrenContainer.insert(cmpr.hostView)
            }
          }

          resolve(cpr)
        })
      })

    }

    return await createComp(snapshot)
  }

  insert(parent: string | BlockCraft.BlockComponentRef, index: number, comps: BlockCraft.BlockComponentRef[]) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    const childrenContainer = instance.childrenContainer
    if (!childrenContainer) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parentComp.instance.id} block has no children`)
    }

    comps.forEach((comp, i) => {
      comp.instance.parentId = instance.id;
      childrenContainer.insert(comp.hostView, index + i);
    });
  }

  remove(parent: string | BlockCraft.BlockComponentRef, index: number, length = 1) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    if (!instance.childrenContainer) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parent} block has no children`)
    }

    while (length > 0) {
      if (index > instance.childrenContainer.length) return
      // instance.childrenContainer.detach(index)
      instance.childrenContainer.remove(index)
      length--
    }
  }

  detach(ids: string[]) {
    ids.forEach(id => {
      this._gcTags.add(id)
      this.get(id)?.instance.detach()
    })
  }

  async gc() {
    this._gcTags.forEach(i => {
      const cpr = this.store.get(i)
      cpr && cpr.destroy()
      this.store.delete(i)
      this._gcTags.delete(i)
    })
  }

}

declare global {
  namespace BlockCraft {
    type ViewManager = DocVM

    interface IBlockComponents {
    }

    type BlockFlavour = keyof IBlockComponents
    type BlockComponent<T extends BlockFlavour = BlockFlavour> = IBlockComponents[T] | BaseBlockComponent
    type BlockComponentRef<T extends BlockFlavour = BlockFlavour> = ComponentRef<BlockComponent<T>>
  }
}
