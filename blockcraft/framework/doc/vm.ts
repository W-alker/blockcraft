import {ComponentRef, ViewContainerRef} from "@angular/core";
import {BaseBlockComponent} from "../block";
import {lastValueFrom, take} from "rxjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {BlockNodeType, IBlockSnapshot} from "../types";
import {YBlock} from "../reactive";
import * as Y from "yjs";

export class DocVM {

  private _vcr = this.doc.injector.get(ViewContainerRef)

  private store: Map<string, BlockCraft.BlockComponentRef> = new Map()

  private _gcTags = new Set<string>()

  constructor(
    public readonly doc: BlockCraft.Doc
  ) {
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

  delete(id: string) {
    const cpr = this.store.get(id)
    if (!cpr) return
    cpr.changeDetectorRef.detach()
    this._gcTags.add(id)
  }

  get<T extends BlockCraft.BlockFlavour = 'base'>(id: string) {
    return this.store.get(id) as BlockCraft.BlockComponentRef<T> | undefined
  }

  async createComponentByYBlocks(yBlocks: Record<string, YBlock>) {

    // 乱序的，要根据children中的Id顺序组合
    const createComp = async (yBlock: YBlock, parentId: string | null = null) => {
      const id = yBlock.get('id')
      // try get it from cache
      if (this.has(id)) {
        const cpr = this.get(id)!
        cpr.changeDetectorRef.reattach()
        return cpr
      }

      const schema = this.schemas.get(yBlock.get('flavour'))
      const cpr = this._vcr.createComponent(schema.component)
      cpr.setInput('yBlock', yBlock)
      cpr.setInput('doc', this.doc)
      cpr.instance.parentId = parentId

      this.set(id, cpr)

      if (yBlock.get('nodeType') === BlockNodeType.block && yBlock.get('children').length) {
        await lastValueFrom(cpr.instance.onViewInit$).then(() => {
          yBlock.get('children').forEach(async childId => {
            const cmpr = await createComp(yBlocks[childId]!, id);
            (cpr.instance.childrenContainer as ViewContainerRef).insert(cmpr.hostView)
          })
        })
      }

      return cpr
    }

    const citedBlocks = new Set(
      Object.values(yBlocks).flatMap(item => item.get('children') instanceof Y.Array ? item.get('children').toArray() : [])
    )
    const res: Record<string, BlockCraft.BlockComponentRef> = {}
    for (const id in yBlocks) {
      if (citedBlocks.has(id)) continue
      res[id] = await createComp(yBlocks[id]!)
    }

    return res
  }

  async createComponentBySnapshot<T extends IBlockSnapshot>(snapshot: T, cb?: (cpr: BlockCraft.BlockComponentRef) => void): Promise<BlockCraft.BlockComponentRef> {

    const createComp = async (snapshot: IBlockSnapshot, parentId: string | null = null) => {

      return new Promise<BlockCraft.BlockComponentRef>((resolve, reject) => {

        // try get it from cache
        if (this.has(snapshot.id)) {
          const cpr = this.get<T['flavour']>(snapshot.id)!
          cpr.changeDetectorRef.reattach()
          resolve(cpr)
          return
        }

        const {id, nodeType, flavour, props, meta, children} = snapshot

        const schema = this.schemas.get(flavour)
        const cpr = this._vcr.createComponent(schema.component)

        cpr.instance.parentId = parentId
        cpr.setInput('doc', this.doc)
        cpr.setInput('model', {
          id,
          nodeType,
          flavour,
          props,
          meta,
          children: nodeType === BlockNodeType.block ? children.map(childSnapshot => childSnapshot.id) : children,
        })
        cb && cb(cpr)

        this.set(id, cpr)

        cpr.instance.onViewInit$.pipe(take(1)).subscribe(async () => {

          if (nodeType === BlockNodeType.block && children.length) {
            for (const childSnapshot of children) {
              console.log(childSnapshot)
              const cmpr = await createComp(childSnapshot as IBlockSnapshot, id);
              (cpr.instance.childrenContainer as ViewContainerRef).insert(cmpr.hostView)
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
    if (!parentComp.instance.childrenContainer) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parentComp.instance.id} block has no children`)
    }

    comps.forEach((comp, i) => {
      (parentComp.instance.childrenContainer as ViewContainerRef).insert(comp.hostView, index + i);
      comp.instance.parentId = parentComp.instance.id;
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

    for (let i = 0; i < length; i++) {
      const vr = instance.childrenContainer.detach(index)!
      vr.detach()
    }

    const sliceIds = instance.childrenIds.slice(index, index + length)
    sliceIds.forEach(id => {
      this._gcTags.add(id)
    });

    return sliceIds
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
    interface IBlockComponents {
      base: BaseBlockComponent
    }

    type BlockFlavour = keyof IBlockComponents
    type BlockComponent<T extends BlockFlavour = BlockFlavour> = IBlockComponents[T]
    type BlockComponentRef<T extends BlockFlavour = BlockFlavour> = ComponentRef<BlockComponent<T>>
  }
}
