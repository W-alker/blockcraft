import {MarkdownStreamSession} from "./stream-session";
import {SnapshotViewerStreamEngine} from "./stream-engine";
import {MarkdownStreamViewer, MarkdownStreamViewerOptions} from "./types";

class MarkdownStreamViewerController implements MarkdownStreamViewer {
  private readonly session = new MarkdownStreamSession()
  private readonly engine = new SnapshotViewerStreamEngine(this.options)

  constructor(readonly options: MarkdownStreamViewerOptions = {}) {
  }

  append(chunk: string): void {
    this.session.append(chunk)
    this.engine.append(chunk)
  }

  replace(markdown: string): void {
    this.session.replace(markdown)
    this.engine.replace(markdown)
  }

  finish(): void {
    this.session.finish()
    this.engine.finish()
  }

  destroy(): void {
    this.session.destroy()
    this.engine.destroy()
  }
}

export function createMarkdownStreamViewer(
  options: MarkdownStreamViewerOptions = {}
): MarkdownStreamViewer {
  return new MarkdownStreamViewerController(options)
}
