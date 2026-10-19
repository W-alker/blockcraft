import {SnapshotViewerStreamEngine} from "./stream-engine";
import {MarkdownStreamViewer, MarkdownStreamViewerOptions} from "./types";

class MarkdownStreamViewerController implements MarkdownStreamViewer {
  private readonly engine: SnapshotViewerStreamEngine

  constructor(options: MarkdownStreamViewerOptions = {}) {
    this.engine = new SnapshotViewerStreamEngine(options)
  }

  append(chunk: string): void {
    this.engine.append(chunk)
  }

  replace(markdown: string): void {
    this.engine.replace(markdown)
  }

  finish(): void {
    this.engine.finish()
  }

  destroy(): void {
    this.engine.destroy()
  }
}

export function createMarkdownStreamViewer(
  options: MarkdownStreamViewerOptions = {}
): MarkdownStreamViewer {
  return new MarkdownStreamViewerController(options)
}
