import {YBlock} from "../../reactive";

export class Virtualizer {
  private cache: Map<string, BlockCraft.BlockComponentRef> = new Map();
  private heightMap = new Map<string, number>();

  private containerHeight = 0;
  private rootHeight = 0;
  private pageSize = 10;

  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
    this.doc.afterInit(() => {
      this._observeContainer()
      // this.doc.root.getChildrenBlocks()
    })
  }

  init(yRoot: YBlock) {
    const children = yRoot.get('children').toArray() as string[]

  }

  private _observeContainer() {
    const scrollContainerResizeObs = new ResizeObserver(entries => {
      this.containerHeight = entries[0].borderBoxSize[0].blockSize;
      console.log('%c容器高度变化', 'color: blue', this.containerHeight, this.doc.scrollContainer)
    })
    scrollContainerResizeObs.observe(this.doc.scrollContainer!)

    const rootResizeObs = new ResizeObserver(entries => {
      this.rootHeight = entries[0].contentRect.height;
      console.log('%c根节点高度变化', 'color: blue', this.rootHeight, this.doc.root.hostElement)
    })
    rootResizeObs.observe(this.doc.root.hostElement)
  }

}
