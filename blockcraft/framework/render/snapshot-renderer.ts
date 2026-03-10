import {ApplicationRef, ComponentRef, Injector, createComponent} from "@angular/core";
import {BlockCraftError, ErrorCode} from "../../global";
import {BlockNodeType, IBlockSnapshot} from "../block-std";
import {BlockChildrenRenderRef} from "./block-children-render-ref";
import {BlockRenderContext} from "./types";
import {cloneBlockSnapshot, snapshotToNativeBlockModel} from "./utils";

export type SnapshotRendererOptions = {
  injector: Injector;
  schemas: BlockCraft.SchemaManager;
  renderContext: BlockRenderContext;
  doc?: BlockCraft.Doc;
};

export class SnapshotRenderer {
  private readonly appRef = this.options.injector.get(ApplicationRef);
  private readonly envInjector = this.appRef.injector;
  private readonly store = new Map<string, BlockCraft.BlockComponentRef>();
  private rootRef: BlockCraft.BlockComponentRef | null = null;
  private container: HTMLElement | null = null;

  constructor(private readonly options: SnapshotRendererOptions) {
  }

  mount(root: IBlockSnapshot, container: HTMLElement) {
    this.destroy();
    this.container = container;
    const rootRef = this.createComponent(root, null);
    container.replaceChildren(rootRef.location.nativeElement);
    this.rootRef = rootRef;
  }

  update(root: IBlockSnapshot) {
    if (!this.container || !this.rootRef) {
      throw new BlockCraftError(ErrorCode.NoRootError, 'SnapshotRenderer is not mounted');
    }

    if (!this.canReuse(this.rootRef.instance, root)) {
      this.mount(root, this.container);
      return;
    }

    this.patchComponent(this.rootRef, root, null);
  }

  get<T extends BlockCraft.BlockFlavour>(id: string) {
    return this.store.get(id) as BlockCraft.BlockComponentRef<T> | undefined;
  }

  has(id: string) {
    return this.store.has(id);
  }

  destroy(id?: string) {
    if (id) {
      const cpr = this.store.get(id);
      if (!cpr) return;
      cpr.instance.childrenRenderRef?.clearAll();
      cpr.instance.hostElement.remove();
      cpr.destroy();
      this.store.delete(id);
      if (this.rootRef?.instance.id === id) {
        this.rootRef = null;
      }
      return;
    }

    [...this.store.keys()].forEach((blockId) => this.destroy(blockId));
    this.store.clear();
    this.rootRef = null;
    this.container = null;
  }

  private createComponent(snapshot: IBlockSnapshot, parentId: string | null) {
    const schema = this.options.schemas.get(snapshot.flavour)!;
    const cpr = createComponent(schema.component, {
      elementInjector: this.options.injector,
      environmentInjector: this.envInjector,
    });

    cpr.instance.parentId = parentId;
    cpr.setInput('snapshot', cloneBlockSnapshot(snapshot));
    cpr.setInput('model', snapshotToNativeBlockModel(snapshot));
    cpr.setInput('renderContext', this.options.renderContext);
    if (this.options.doc) {
      cpr.setInput('doc', this.options.doc);
    }

    if (snapshot.nodeType !== BlockNodeType.editable && snapshot.nodeType !== BlockNodeType.void) {
      cpr.instance.childrenRenderRef = new BlockChildrenRenderRef(cpr.instance, this);
    }

    this.store.set(snapshot.id, cpr);
    this.appRef.attachView(cpr.hostView);
    cpr.changeDetectorRef.detectChanges();

    if (
      (snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root) &&
      snapshot.children.length &&
      cpr.instance.childrenRenderRef
    ) {
      const children = snapshot.children.map((child) => this.createComponent(child, snapshot.id));
      cpr.instance.childrenRenderRef.insert(0, children);
    }

    return cpr;
  }

  private patchComponent(
    cpr: BlockCraft.BlockComponentRef,
    snapshot: IBlockSnapshot,
    parentId: string | null,
  ) {
    cpr.instance.parentId = parentId;
    cpr.setInput('snapshot', cloneBlockSnapshot(snapshot));
    cpr.setInput('model', snapshotToNativeBlockModel(snapshot));
    cpr.setInput('renderContext', this.options.renderContext);
    if (this.options.doc) {
      cpr.setInput('doc', this.options.doc);
    }

    if (snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root) {
      this.patchChildren(cpr, snapshot.children);
    }

    cpr.changeDetectorRef.detectChanges();
  }

  private patchChildren(parentRef: BlockCraft.BlockComponentRef, snapshots: IBlockSnapshot[]) {
    const renderRef = parentRef.instance.childrenRenderRef;
    if (!renderRef) return;

    let index = 0;
    while (index < renderRef.length || index < snapshots.length) {
      const currentRef = renderRef.get(index);
      const nextSnapshot = snapshots[index];

      if (!currentRef && nextSnapshot) {
        renderRef.insert(index, [this.createComponent(nextSnapshot, parentRef.instance.id)]);
        index++;
        continue;
      }

      if (currentRef && !nextSnapshot) {
        renderRef.remove(index, 1);
        continue;
      }

      if (!currentRef || !nextSnapshot) {
        break;
      }

      if (this.canReuse(currentRef.instance, nextSnapshot)) {
        this.patchComponent(currentRef, nextSnapshot, parentRef.instance.id);
        index++;
        continue;
      }

      renderRef.remove(index, 1);
      renderRef.insert(index, [this.createComponent(nextSnapshot, parentRef.instance.id)]);
      index++;
    }
  }

  private canReuse(block: BlockCraft.BlockComponent, snapshot: IBlockSnapshot) {
    return block.id === snapshot.id &&
      block.flavour === snapshot.flavour &&
      block.nodeType === snapshot.nodeType;
  }
}
