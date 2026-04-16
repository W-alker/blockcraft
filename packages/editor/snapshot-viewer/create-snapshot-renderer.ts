import {SnapshotRenderEngine} from "./snapshot-render-engine";
import {SnapshotRenderer, SnapshotViewerOptions} from "./types";

export function createSnapshotRenderer(options: SnapshotViewerOptions = {}): SnapshotRenderer {
  return new SnapshotRenderEngine(options)
}
