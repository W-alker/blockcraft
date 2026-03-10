import * as Y from 'yjs';
import {
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  EditableBlockComponent,
  IAdapter,
  IBlockSnapshot,
  native2YBlock,
  ORIGIN_NO_RECORD,
} from "../framework";

type MarkdownRenderOptions = {
  immediate?: boolean;
};

type BlockSnapshotWithChildren = Extract<IBlockSnapshot, {
  nodeType: BlockNodeType.block | BlockNodeType.root;
}>;

const deltaAttributesEqual = (
  left?: DeltaInsert['attributes'],
  right?: DeltaInsert['attributes'],
) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});

const deltaUnitEqual = (left: DeltaInsert, right: DeltaInsert) => {
  if (!deltaAttributesEqual(left.attributes, right.attributes)) {
    return false;
  }

  if (typeof left.insert === 'string' && typeof right.insert === 'string') {
    return left.insert === right.insert;
  }

  if (typeof left.insert !== 'object' || typeof right.insert !== 'object') {
    return false;
  }

  return JSON.stringify(left.insert) === JSON.stringify(right.insert);
};

const blockPropsEqual = (
  left: IBlockSnapshot['props'],
  right: IBlockSnapshot['props'],
) => JSON.stringify(left) === JSON.stringify(right);

const explodeDeltaUnits = (delta: DeltaInsert[]): DeltaInsert[] => {
  const units: DeltaInsert[] = [];

  delta.forEach((item) => {
    if (typeof item.insert === 'string') {
      for (const char of item.insert) {
        units.push(item.attributes ? {insert: char, attributes: item.attributes} : {insert: char});
      }
      return;
    }

    units.push(item.attributes ? {insert: item.insert, attributes: item.attributes} : {insert: item.insert});
  });

  return units;
};

const compactDeltaUnits = (units: DeltaInsert[]): DeltaInsert[] => {
  const compacted: DeltaInsert[] = [];

  units.forEach((item) => {
    const last = compacted.at(-1);
    if (
      last &&
      typeof last.insert === 'string' &&
      typeof item.insert === 'string' &&
      deltaAttributesEqual(last.attributes, item.attributes)
    ) {
      last.insert += item.insert;
      return;
    }

    compacted.push(item.attributes ? {insert: item.insert, attributes: item.attributes} : {insert: item.insert});
  });

  return compacted;
};

const buildDeltaPatch = (current: DeltaInsert[], next: DeltaInsert[]): DeltaOperation[] => {
  const currentUnits = explodeDeltaUnits(current);
  const nextUnits = explodeDeltaUnits(next);

  let start = 0;
  while (
    start < currentUnits.length &&
    start < nextUnits.length &&
    deltaUnitEqual(currentUnits[start]!, nextUnits[start]!)
  ) {
    start++;
  }

  if (start === currentUnits.length && start === nextUnits.length) {
    return [];
  }

  let currentEnd = currentUnits.length - 1;
  let nextEnd = nextUnits.length - 1;

  while (
    currentEnd >= start &&
    nextEnd >= start &&
    deltaUnitEqual(currentUnits[currentEnd]!, nextUnits[nextEnd]!)
  ) {
    currentEnd--;
    nextEnd--;
  }

  const operations: DeltaOperation[] = [];
  if (start > 0) {
    operations.push({retain: start});
  }

  const deleteCount = currentEnd - start + 1;
  if (deleteCount > 0) {
    operations.push({delete: deleteCount});
  }

  compactDeltaUnits(nextUnits.slice(start, nextEnd + 1)).forEach((item) => {
    operations.push(
      item.attributes
        ? {insert: item.insert, attributes: item.attributes}
        : {insert: item.insert},
    );
  });

  return operations;
};

export class MarkdownStreamRenderer {
  private sourceMarkdown = '';
  private renderedMarkdown: string | null = null;
  private scheduledFrame: number | null = null;
  private scheduledRender: Promise<void> | null = null;
  private renderInFlight: Promise<void> = Promise.resolve();
  private rerenderRequested = false;

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly markdownAdapter: IAdapter,
  ) {}

  get value() {
    return this.sourceMarkdown;
  }

  replace(markdown: string, options: MarkdownRenderOptions = {}) {
    this.sourceMarkdown = markdown;
    return options.immediate ? this.flush() : this.schedule();
  }

  append(chunk: string, options: MarkdownRenderOptions = {}) {
    if (!chunk) {
      return options.immediate ? this.flush() : this.schedule();
    }

    this.sourceMarkdown += chunk;
    return options.immediate ? this.flush() : this.schedule();
  }

  clear(options: MarkdownRenderOptions = {}) {
    this.sourceMarkdown = '';
    return options.immediate ? this.flush() : this.schedule();
  }

  destroy() {
    if (this.scheduledFrame !== null) {
      cancelAnimationFrame(this.scheduledFrame);
      this.scheduledFrame = null;
    }
    this.scheduledRender = null;
  }

  schedule() {
    if (this.scheduledRender) {
      return this.scheduledRender;
    }

    this.scheduledRender = new Promise<void>((resolve, reject) => {
      this.scheduledFrame = requestAnimationFrame(() => {
        this.scheduledFrame = null;
        this.flush()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.scheduledRender = null;
          });
      });
    });

    return this.scheduledRender;
  }

  flush() {
    if (this.sourceMarkdown === this.renderedMarkdown && !this.rerenderRequested) {
      return this.renderInFlight;
    }

    this.rerenderRequested = true;
    this.renderInFlight = this.renderInFlight.then(async () => {
      while (this.rerenderRequested) {
        this.rerenderRequested = false;
        const markdown = this.sourceMarkdown;
        const rootSnapshot = await this.markdownAdapter.toSnapshot(markdown);
        this.applyRootSnapshot(this.normalizeRootSnapshot(rootSnapshot));
        this.renderedMarkdown = markdown;
      }
    });

    return this.renderInFlight;
  }

  private normalizeRootSnapshot(snapshot: IBlockSnapshot) {
    if (snapshot.nodeType !== BlockNodeType.root) {
      throw new Error('Markdown adapter must return a root snapshot.');
    }

    if (snapshot.children.length > 0) {
      return snapshot as BlockSnapshotWithChildren;
    }

    return this.doc.schemas.createSnapshot('root', [
      this.doc.rootId,
      [this.doc.schemas.createSnapshot('paragraph', [])],
    ]) as BlockSnapshotWithChildren;
  }

  private applyRootSnapshot(snapshot: BlockSnapshotWithChildren) {
    this.doc.crud.transact(() => {
      this.syncChildren(this.doc.rootId, snapshot.children);
    }, ORIGIN_NO_RECORD);
  }

  private syncChildren(parentId: string, nextChildren: IBlockSnapshot[]) {
    let index = 0;

    while (true) {
      const parent = this.doc.getBlockById(parentId);
      const currentIds = parent.childrenIds;
      const currentId = currentIds[index];
      const nextSnapshot = nextChildren[index];

      if (!currentId && !nextSnapshot) {
        break;
      }

      if (!currentId && nextSnapshot) {
        this.insertSnapshots(parentId, index, [nextSnapshot]);
        index++;
        continue;
      }

      if (currentId && !nextSnapshot) {
        this.deleteChildren(parentId, index, 1);
        continue;
      }

      const currentBlock = this.doc.getBlockById(currentId!);
      if (this.canPatchInPlace(currentBlock, nextSnapshot!)) {
        this.patchBlock(currentBlock, nextSnapshot!);
        index++;
        continue;
      }

      const nextCurrentId = currentIds[index + 1];
      if (nextCurrentId) {
        const nextCurrentBlock = this.doc.getBlockById(nextCurrentId);
        if (this.canPatchInPlace(nextCurrentBlock, nextSnapshot!)) {
          this.deleteChildren(parentId, index, 1);
          continue;
        }
      }

      const followingSnapshot = nextChildren[index + 1];
      if (followingSnapshot && this.canPatchInPlace(currentBlock, followingSnapshot)) {
        this.insertSnapshots(parentId, index, [nextSnapshot!]);
        index++;
        continue;
      }

      this.replaceChild(parentId, index, nextSnapshot!);
      index++;
    }
  }

  private canPatchInPlace(block: BlockCraft.BlockComponent, snapshot: IBlockSnapshot) {
    return block.flavour === snapshot.flavour && block.nodeType === snapshot.nodeType;
  }

  private patchBlock(block: BlockCraft.BlockComponent, snapshot: IBlockSnapshot) {
    this.syncProps(block, snapshot.props);

    if (block.nodeType === BlockNodeType.editable && snapshot.nodeType === BlockNodeType.editable) {
      this.patchEditableBlock(block as EditableBlockComponent, snapshot.children);
      return;
    }

    if (
      (block.nodeType === BlockNodeType.block || block.nodeType === BlockNodeType.root) &&
      (snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root)
    ) {
      this.syncChildren(block.id, snapshot.children);
    }
  }

  private patchEditableBlock(block: EditableBlockComponent, nextDelta: DeltaInsert[]) {
    const operations = buildDeltaPatch(block.textDeltas(), nextDelta);
    if (operations.length === 0) {
      return;
    }

    block.applyDeltaOperations(operations);
  }

  private syncProps(block: BlockCraft.BlockComponent, nextProps: IBlockSnapshot['props']) {
    if (blockPropsEqual(block.props, nextProps)) {
      return;
    }

    const yProps = block.yBlock.get('props') as Y.Map<unknown>;
    const currentKeys = new Set(Object.keys(block.props));

    Object.entries(nextProps).forEach(([key, value]) => {
      currentKeys.delete(key);
      if (JSON.stringify(block.props[key]) === JSON.stringify(value)) {
        return;
      }
      yProps.set(key, value);
    });

    currentKeys.forEach((key) => {
      yProps.delete(key);
    });
  }

  private insertSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]) {
    const parent = this.doc.getBlockById(parentId);
    const yChildren = parent.yBlock.get('children') as Y.Array<string>;
    snapshots.forEach((snapshot) => this.mountSnapshot(snapshot));
    yChildren.insert(index, snapshots.map((snapshot) => snapshot.id));
  }

  private replaceChild(parentId: string, index: number, snapshot: IBlockSnapshot) {
    const parent = this.doc.getBlockById(parentId);
    const yChildren = parent.yBlock.get('children') as Y.Array<string>;
    const currentId = parent.childrenIds[index];

    if (currentId) {
      this.deleteBlockTree(currentId);
      yChildren.delete(index, 1);
    }

    this.mountSnapshot(snapshot);
    yChildren.insert(index, [snapshot.id]);
  }

  private deleteChildren(parentId: string, index: number, count: number) {
    if (count <= 0) {
      return;
    }

    const parent = this.doc.getBlockById(parentId);
    const yChildren = parent.yBlock.get('children') as Y.Array<string>;
    const removingIds = parent.childrenIds.slice(index, index + count);

    removingIds.forEach((id) => this.deleteBlockTree(id));
    yChildren.delete(index, count);
  }

  private deleteBlockTree(blockId: string) {
    const yBlock = this.doc.yBlockMap.get(blockId);
    if (!yBlock) {
      return;
    }

    const children = yBlock.get('children');
    if (children instanceof Y.Array) {
      children.toArray().forEach((childId) => {
        this.deleteBlockTree(childId as string);
      });
    }

    this.doc.yBlockMap.delete(blockId);
  }

  private mountSnapshot(snapshot: IBlockSnapshot) {
    const nativeBlock =
      snapshot.nodeType === BlockNodeType.editable
        ? snapshot
        : {
          ...snapshot,
          children: snapshot.children.map((child) => child.id),
        };

    this.doc.yBlockMap.set(
      snapshot.id,
      native2YBlock(nativeBlock as never),
    );

    if (snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root) {
      snapshot.children.forEach((child) => this.mountSnapshot(child));
    }
  }
}
