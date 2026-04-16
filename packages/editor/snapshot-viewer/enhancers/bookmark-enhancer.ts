import {DocLinkPreviewerService} from "../../framework/services/link-previewer.service";
import {SnapshotEnhancementTask, SnapshotViewerOptions} from "../types";

const defaultLinkPreviewer = new DocLinkPreviewerService();

export function createBookmarkEnhancementTask(
  options: SnapshotViewerOptions,
  url: string,
  target: Element,
  key: string,
  apply: (value: Record<string, unknown>) => void
): SnapshotEnhancementTask<Record<string, unknown>> | null {
  const load = options.enhancers?.bookmark?.load ?? ((nextUrl: string, signal: AbortSignal) => {
    return defaultLinkPreviewer.query(nextUrl, signal) as Promise<Record<string, unknown>> | Record<string, unknown>;
  })
  if (!load) {
    return null
  }

  return {
    key,
    target,
    policy: "eager",
    load: (signal) => load(url, signal) as Promise<Record<string, unknown>> | Record<string, unknown>,
    apply,
  }
}
