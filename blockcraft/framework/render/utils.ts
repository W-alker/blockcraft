import {IBlockSnapshot} from "../block-std";

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
