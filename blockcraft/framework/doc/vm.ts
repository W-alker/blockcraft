import {ApplicationRef, ComponentRef, createComponent, ViewContainerRef} from "@angular/core";
import {take} from "rxjs";
import {BlockCraftError, ErrorCode, performanceTest} from "../../global";
import {
  BaseBlockComponent,
  BlockNodeType,
  IBlockSnapshot,
  native2YBlock,
  NativeBlockModel,
  YBlock,
  yBlock2Native
} from "../block-std";
import * as Y from "yjs";

export class DocVM {

  appRef = this.doc.injector.get(ApplicationRef)
  private envInjector = this.appRef.injector
  private store: Map<string, BlockCraft.BlockComponentRef> = new Map()

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

  createComponentByYBlocks(yBlocks: Record<string, YBlock>) {
    // 乱序的，要根据children中的Id顺序组合
    const createComp = (yBlock: YBlock, parent: BlockCraft.BlockComponentRef | null = null) => {
      const id = yBlock.get('id')
      // try get it from cache
      if (this.has(id)) {
        return this.get(id) as BlockCraft.BlockComponentRef
      }

      const schema = this.schemas.get(yBlock.get('flavour'))!
      const cpr = createComponent(schema.component, {
        elementInjector: this.doc.injector,
        environmentInjector: this.envInjector,
      })

      cpr.setInput('model', yBlock2Native(yBlock))
      cpr.setInput('yBlock', yBlock)
      cpr.setInput('doc', this.doc)
      cpr.instance.parentId = parent?.instance.id || null
      if (cpr.instance.nodeType !== BlockNodeType.editable && cpr.instance.nodeType !== BlockNodeType.void) {
        cpr.instance.childrenRenderRef = new BlockChildrenRenderRef(cpr.instance, this)
      }

      this.set(id, cpr)
      this.appRef.attachView(cpr.hostView)

      const yChildren = yBlock.get('children')
      if (yBlock.get('nodeType') !== BlockNodeType.editable && yChildren.length) {
        const childrenComps = yChildren.toArray().map(
          childId => {
            let yBlock = yBlocks[childId] || this.doc.crud.getYBlock(childId)
            // 兜底代码
            if (!yBlock) {
              this.doc.logger.warn('有丢失段落: ' + childId)
              yBlock = native2YBlock({
                id: childId,
                nodeType: BlockNodeType.editable,
                flavour: 'paragraph',
                props: {depth: 0},
                meta: {},
                children: []
              })
              this.doc.yBlockMap.set(childId, yBlock)
            }
            return createComp(yBlock, cpr)
          }
        )
        cpr.instance.childrenRenderRef?.insert(0, childrenComps)
      }

      cpr.changeDetectorRef.detectChanges()
      return cpr
    }

    const res: Record<string, BlockCraft.BlockComponentRef> = {}
    for (const id in yBlocks) {
      res[id] = createComp(yBlocks[id]!)
    }

    return res
  }

  createComponentBySnapshot<T extends IBlockSnapshot>(snapshot: T, cb?: (cpr: BlockCraft.BlockComponentRef) => void) {

    const createComp = (snapshot: IBlockSnapshot, parentId: string | null = null) => {
      const {id, nodeType, flavour, props, meta, children} = snapshot

      const schema = this.schemas.get(flavour)!
      const cpr = createComponent(schema.component, {
        elementInjector: this.doc.injector,
        environmentInjector: this.envInjector
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
      if (cpr.instance.nodeType !== BlockNodeType.editable && cpr.instance.nodeType !== BlockNodeType.void) {
        cpr.instance.childrenRenderRef = new BlockChildrenRenderRef(cpr.instance, this)
      }

      this.set(id, cpr)
      this.appRef.attachView(cpr.hostView)
      cpr.changeDetectorRef.detectChanges()

      if (children.length && cpr.instance.childrenRenderRef) {
        const childrenComps = (children as IBlockSnapshot[]).map(
          c => createComp(c)
        )
        cpr.instance.childrenRenderRef?.insert(0, childrenComps)
      }

      return cpr
    }

    return createComp(snapshot)
  }

  insert(parent: string | BlockCraft.BlockComponentRef, index: number, comps: BlockCraft.BlockComponentRef[]) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    if (!instance.childrenRenderRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parentComp.instance.id} block has no children`)
    }

    instance.childrenRenderRef!.insert(index, comps)
  }

  remove(parent: string | BlockCraft.BlockComponentRef, index: number, length = 1) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    if (!instance.childrenRenderRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parent} block has no children`)
    }

    instance.childrenRenderRef.remove(index, length)
  }

  destroy(id: string) {
    const cpr = this.store.get(id)
    if (cpr) {
      cpr.instance.childrenRenderRef?.clearAll()
      cpr.destroy()
      this.store.delete(id)
    }
  }

  deleteByIds(ids: string[]) {
    ids.forEach(id => {
      this.destroy(id)
    })
  }

  clear() {
    this.store.forEach((cpr, id) => {
      cpr?.destroy()
    })
    this.store.clear()
  }

}

export class BlockChildrenRenderRef {
  private _containerElement?: HTMLElement
  get containerElement() {
    return this._containerElement ??= (this.block.hostElement.querySelector('.children-render-container') || this.block.hostElement)
  }

  private _compRefs: BlockCraft.BlockComponentRef[] = []

  constructor(private readonly block: BlockCraft.BlockComponent, private vm: DocVM) {
  }

  insert(index: number, comps: BlockCraft.BlockComponentRef[]) {
    const _chs = comps.map(comp => {
      comp.instance.parentId = this.block.id;
      return comp.location.nativeElement
    })
    if (!this._compRefs.length || index === 0) {
      this.containerElement.prepend(..._chs)
    } else {
      const startComps = this._compRefs[index - 1]
      startComps.instance.hostElement.after(..._chs)
    }
    this._compRefs.splice(index, 0, ...comps)
  }

  remove(index: number, length = 1) {
    const comps = this._compRefs.splice(index, length)
    comps.forEach(comp => {
      this.vm.destroy(comp.instance.id)
    })
  }

  clearAll() {
    this._compRefs.forEach(comp => {
      this.vm.destroy(comp.instance.id)
    })
    this._compRefs = []
  }

  get(index: number) {
    return this._compRefs[index]
  }

  slice(start: number, end: number) {
    return this._compRefs.slice(start, start + end)
  }

  splice(index: number, length: number) {
    return this._compRefs.splice(index, length)
  }

  get length() {
    return this._compRefs.length
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
