import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {NormalizedSnapshot, SnapshotViewerOptions} from "../types";

const DEFAULT_ROOT_ID = "snapshot-root"

export function normalizeSnapshot(
  snapshot: IBlockSnapshot | IBlockSnapshot[],
  options: SnapshotViewerOptions = {}
): NormalizedSnapshot {
  if (Array.isArray(snapshot)) {
    return {
      root: {
        id: options.rootId ?? DEFAULT_ROOT_ID,
        flavour: "root",
        nodeType: BlockNodeType.root,
        meta: {},
        props: {},
        children: snapshot
      }
    }
  }

  return {
    root: snapshot
  }
}
