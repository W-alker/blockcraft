import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../block-std";
import {SimpleBasicType} from "../../../global";
import {ClipboardCopyFilter, CopyFilterContext} from "./types";

interface CopyFilterLogger {
  warn(message: string, ...args: unknown[]): void
}

/** Clone a clipboard tree and remove BlockCraft's persistent block-lock owner. */
export function stripBlockLockMetaDeep(root: IBlockSnapshot): IBlockSnapshot {
  const cloned = cloneSnapshot(root);
  const visit = (node: IBlockSnapshot) => {
    if (node.meta && Object.prototype.hasOwnProperty.call(node.meta, 'lock')) {
      delete node.meta.lock;
    }
    if (isContainer(node) && Array.isArray(node.children)) {
      (node.children as IBlockSnapshot[]).forEach(visit);
    }
  };
  visit(cloned);
  return cloned;
}

/** @deprecated Use `stripBlockLockMetaDeep`. */
export const stripReadonlyMetaDeep = stripBlockLockMetaDeep;

/** Resolve the filter pipeline for one copy: `false`→none, object→replace, else→registry. */
export function resolveCopyFilters(
  registered: readonly ClipboardCopyFilter[],
  override?: ClipboardCopyFilter | false
): readonly ClipboardCopyFilter[] {
  if (override === false) return [];
  if (override) return [override];
  return registered;
}

/**
 * Apply filters in order. Clones once; the input `root` is never mutated.
 * Each filter runs prune → strip → transform; a throwing transform is isolated.
 */
export function applyCopyFilters(
  root: IBlockSnapshot,
  filters: readonly ClipboardCopyFilter[],
  ctx: CopyFilterContext,
  logger?: CopyFilterLogger
): IBlockSnapshot {
  if (!filters.length) return root;
  let tree = cloneSnapshot(root);
  for (const filter of filters) {
    pruneChildBlocks(tree, filter, ctx);
    if (filter.stripAttributes) stripDeltaAttributes(tree, filter.stripAttributes);
    if (filter.transform) {
      try {
        const result = filter.transform(tree, ctx);
        // A transform that forgets to return must not poison the pipeline —
        // keep the last known-good tree so downstream filters/serialization stay safe.
        if (result) tree = result;
        else logger?.warn('copy filter transform returned no snapshot; ignoring');
      } catch (e) {
        logger?.warn('copy filter transform error', e);
      }
    }
  }
  return tree;
}

function cloneSnapshot(value: IBlockSnapshot): IBlockSnapshot {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as IBlockSnapshot;
}

function isContainer(node: IBlockSnapshot): boolean {
  return node.nodeType === BlockNodeType.root || node.nodeType === BlockNodeType.block;
}

function shouldExclude(node: IBlockSnapshot, filter: ClipboardCopyFilter, ctx: CopyFilterContext): boolean {
  if (filter.excludeFlavours?.includes(node.flavour)) return true;
  return filter.excludeBlock ? filter.excludeBlock(node, ctx) : false;
}

/** In-place: drop child blocks matching the exclusion rules (with subtree). Root itself is never removed. */
function pruneChildBlocks(node: IBlockSnapshot, filter: ClipboardCopyFilter, ctx: CopyFilterContext): void {
  if (!isContainer(node)) return;
  const kept: IBlockSnapshot[] = [];
  for (const child of node.children as IBlockSnapshot[]) {
    if (shouldExclude(child, filter, ctx)) continue;
    pruneChildBlocks(child, filter, ctx);
    kept.push(child);
  }
  node.children = kept; // IBlockSnapshot intersects UnknownRecord — assignment is permitted
}

/** In-place: strip matching attribute keys from every editable node's delta ops. */
function stripDeltaAttributes(
  node: IBlockSnapshot,
  strip: NonNullable<ClipboardCopyFilter['stripAttributes']>
): void {
  if (node.nodeType === BlockNodeType.editable) {
    for (const op of node.children as DeltaInsert[]) stripOpAttributes(op, strip);
    return;
  }
  if (isContainer(node)) {
    for (const child of node.children as IBlockSnapshot[]) stripDeltaAttributes(child, strip);
  }
}

function stripOpAttributes(
  op: DeltaInsert,
  strip: NonNullable<ClipboardCopyFilter['stripAttributes']>
): void {
  const attrs = op.attributes;
  if (!attrs) return;
  const hit = typeof strip === 'function'
    ? (key: string, value: SimpleBasicType) => strip(key, value)
    : (key: string) => strip.includes(key);
  for (const key of Object.keys(attrs)) {
    if (hit(key, attrs[key] as SimpleBasicType)) delete attrs[key];
  }
  if (Object.keys(attrs).length === 0) delete op.attributes;
}
