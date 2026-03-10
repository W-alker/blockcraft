import {DeltaInsert, DeltaOperation, IBlockSnapshot} from "../block-std";

export interface BlockAction {
  type: string;
  payload?: unknown;
}

export interface BlockRenderContext {
  readonly readonly: boolean;
  renderInline(delta: DeltaInsert[], container: HTMLElement): void;
  patchInline(ops: DeltaOperation[], container: HTMLElement): void;
  resolveAsset?(src: string): string;
  dispatchAction?(action: BlockAction): void;
}

export interface BlockTreeHost {
  readonly rootId: string;
  readonly schemas: BlockCraft.SchemaManager;
  transact(fn: () => void, origin?: unknown): void;
  getSnapshot(id: string): IBlockSnapshot | null;
  getChildren(parentId: string): string[];
  patchProps(id: string, props: IBlockSnapshot['props']): void;
  patchText(id: string, ops: DeltaOperation[], next: DeltaInsert[]): void;
  insertSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]): void;
  deleteChildren(parentId: string, index: number, count: number): void;
  replaceChild(parentId: string, index: number, snapshot: IBlockSnapshot): void;
}

export const snapshotToNativeBlockModel = <T extends IBlockSnapshot>(snapshot: T) => {
  if (snapshot.nodeType === 'editable') {
    return snapshot;
  }

  return {
    ...snapshot,
    children: snapshot.children.map((child) => child.id),
  };
};

export const cloneBlockSnapshot = <T extends IBlockSnapshot>(snapshot: T): T => {
  return JSON.parse(JSON.stringify(snapshot)) as T;
};

export const snapshotTextContent = (snapshot: IBlockSnapshot): string => {
  if (snapshot.nodeType === 'editable') {
    return snapshot.children.reduce((acc, cur) => {
      return acc + (typeof cur.insert === 'string' ? cur.insert : cur.insert['break'] ? '\n' : '');
    }, '');
  }

  if (snapshot.nodeType === 'void') {
    return '';
  }

  return snapshot.children.map((child) => snapshotTextContent(child)).join('\n');
};
