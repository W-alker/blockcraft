import {BlockNodeType, YBlock} from '@ccc/blockcraft';
import * as Y from 'yjs';

export type CollaborationRootResolution =
  | {status: 'found'; root: YBlock}
  | {status: 'missing'}
  | {status: 'ambiguous'; rootIds: string[]};

export function resolveCollaborationRoot(
  yBlockMap: Y.Map<YBlock>,
  preferredId: string,
): CollaborationRootResolution {
  const preferred = yBlockMap.get(preferredId);
  if (preferred && isRootBlock(preferred)) {
    return {status: 'found', root: preferred};
  }

  const roots: YBlock[] = [];
  yBlockMap.forEach(block => {
    if (isRootBlock(block)) roots.push(block);
  });

  if (!roots.length) return {status: 'missing'};
  if (roots.length > 1) {
    return {
      status: 'ambiguous',
      rootIds: roots.map(root => root.get('id')),
    };
  }
  return {status: 'found', root: roots[0]};
}

function isRootBlock(block: YBlock): boolean {
  return block.get('flavour') === 'root' && block.get('nodeType') === BlockNodeType.root;
}
