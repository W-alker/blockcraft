import {BlockCraftError, ErrorCode} from "../../global";

export class BlockChildrenRenderRef {
  private _containerElement?: HTMLElement

  get containerElement() {
    return this._containerElement ??= (this.block.hostElement.querySelector('.children-render-container') || this.block.hostElement)
  }

  private _compRefs: BlockCraft.BlockComponentRef[] = []

  constructor(
    private readonly block: BlockCraft.BlockComponent,
    private readonly owner: { destroy(id: string): void }
  ) {
  }

  insert(index: number, comps: BlockCraft.BlockComponentRef[]) {
    const nodes = comps.map(comp => {
      comp.instance.parentId = this.block.id
      return comp.location.nativeElement
    })

    if (index < 0 || index > this._compRefs.length) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `children insert index ${index} out of range`)
    }

    if (!this._compRefs.length || index === 0) {
      this.containerElement.prepend(...nodes)
    } else {
      const prev = this._compRefs[index - 1]
      prev.instance.hostElement.after(...nodes)
    }

    this._compRefs.splice(index, 0, ...comps)
  }

  remove(index: number, length = 1) {
    const comps = this._compRefs.splice(index, length)
    comps.forEach(comp => {
      this.owner.destroy(comp.instance.id)
    })
  }

  clearAll() {
    this._compRefs.forEach(comp => {
      this.owner.destroy(comp.instance.id)
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
