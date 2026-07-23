import {
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  IAdapter,
  IBlockProps,
  IBlockSnapshot,
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
    const currentIds = [...this.doc.model.getChildrenIds(parentId)];
    let index = 0;

    while (true) {
      const currentId = currentIds[index];
      const nextSnapshot = nextChildren[index];

      if (!currentId && !nextSnapshot) {
        break;
      }

      if (!currentId && nextSnapshot) {
        this.insertSnapshots(parentId, index, [nextSnapshot]);
        currentIds.splice(index, 0, nextSnapshot.id);
        index++;
        continue;
      }

      if (currentId && !nextSnapshot) {
        this.deleteChildren(parentId, index, 1);
        currentIds.splice(index, 1);
        continue;
      }

      if (this.canPatchInPlace(currentId!, nextSnapshot!)) {
        this.patchBlock(currentId!, nextSnapshot!);
        index++;
        continue;
      }

      const nextCurrentId = currentIds[index + 1];
      if (nextCurrentId && this.canPatchInPlace(nextCurrentId, nextSnapshot!)) {
        this.deleteChildren(parentId, index, 1);
        currentIds.splice(index, 1);
        continue;
      }

      const followingSnapshot = nextChildren[index + 1];
      if (followingSnapshot && this.canPatchInPlace(currentId!, followingSnapshot)) {
        this.insertSnapshots(parentId, index, [nextSnapshot!]);
        currentIds.splice(index, 0, nextSnapshot!.id);
        index++;
        continue;
      }

      this.replaceChild(currentId!, nextSnapshot!);
      currentIds[index] = nextSnapshot!.id;
      index++;
    }
  }

  private canPatchInPlace(blockId: string, snapshot: IBlockSnapshot) {
    return this.doc.model.getFlavour(blockId) === snapshot.flavour &&
      this.doc.model.getNodeType(blockId) === snapshot.nodeType;
  }

  private patchBlock(blockId: string, snapshot: IBlockSnapshot) {
    this.syncProps(blockId, snapshot.props);
    const nodeType = this.doc.model.getNodeType(blockId);

    if (nodeType === BlockNodeType.editable && snapshot.nodeType === BlockNodeType.editable) {
      this.patchEditableBlock(blockId, snapshot.children);
      return;
    }

    if (
      (nodeType === BlockNodeType.block || nodeType === BlockNodeType.root) &&
      (snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root)
    ) {
      this.syncChildren(blockId, snapshot.children);
    }
  }

  private patchEditableBlock(blockId: string, nextDelta: DeltaInsert[]) {
    const operations = buildDeltaPatch(this.doc.model.getTextDeltas(blockId) ?? [], nextDelta);
    if (operations.length === 0) {
      return;
    }

    this.doc.crud.applyTextDelta(blockId, operations);
  }

  private syncProps(blockId: string, nextProps: IBlockSnapshot['props']) {
    const currentProps = this.doc.model.getProps(blockId) ?? {};
    if (blockPropsEqual(currentProps as IBlockSnapshot['props'], nextProps)) {
      return;
    }

    const patch: Partial<IBlockProps> = {};
    const currentKeys = new Set(Object.keys(currentProps));

    Object.entries(nextProps).forEach(([key, value]) => {
      currentKeys.delete(key);
      if (JSON.stringify(currentProps[key]) === JSON.stringify(value)) {
        return;
      }
      patch[key] = value;
    });

    currentKeys.forEach((key) => {
      patch[key] = null;
    });
    this.doc.crud.updateBlockProps(blockId, patch);
  }

  private insertSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]) {
    this.doc.crud.insertBlockSnapshots(parentId, index, snapshots);
  }

  private replaceChild(blockId: string, snapshot: IBlockSnapshot) {
    this.doc.crud.replaceBlockSnapshots(blockId, [snapshot]);
  }

  private deleteChildren(parentId: string, index: number, count: number) {
    if (count <= 0) {
      return;
    }

    this.doc.crud.deleteBlocks(parentId, index, count, true);
  }
}
