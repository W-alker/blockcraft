import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {createSnapshotRenderer} from "../create-snapshot-renderer";
import {SnapshotRenderer} from "../types";
import {MarkdownStreamSession} from "./stream-session";
import {MarkdownStreamSnapshotParser} from "./stream-parser";
import {MarkdownStreamViewer, MarkdownStreamViewerOptions} from "./types";

export class SnapshotViewerStreamEngine implements MarkdownStreamViewer {
  private readonly session = new MarkdownStreamSession()
  private readonly parser: MarkdownStreamSnapshotParser
  private readonly renderer: SnapshotRenderer
  private readonly container: HTMLElement
  private readonly onError?: (error: unknown) => void
  private flushChain: Promise<void> = Promise.resolve()
  private rendered = false
  private renderedVersion: number | null = null
  private rerenderRequested = false
  private scheduledFlush: Promise<void> | null = null
  private scheduledFrameId: number | null = null
  private destroyed = false

  constructor(options: MarkdownStreamViewerOptions = {}) {
    this.container = options.container ?? document.createElement("div")
    this.renderer = createSnapshotRenderer(options.viewerOptions ?? {})
    this.parser = new MarkdownStreamSnapshotParser(options)
    this.onError = options.onError
  }

  append(chunk: string): void {
    this.session.append(chunk)
    this.rerenderRequested = true
    this.scheduleFlush()
  }

  replace(markdown: string): void {
    this.session.replace(markdown)
    this.rerenderRequested = true
    this.scheduleFlush()
  }

  finish(): void {
    this.session.finish()
    this.scheduleFlush()
  }

  destroy(): void {
    this.destroyed = true
    if (this.scheduledFrameId !== null) {
      cancelAnimationFrame(this.scheduledFrameId)
      this.scheduledFrameId = null
    }
    this.scheduledFlush = null
    this.renderer.destroy()
    this.session.destroy()
    this.renderedVersion = null
  }

  private currentVersion(): number {
    return this.session.getVersion()
  }

  private scheduleFlush(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve()
    }
    if (this.scheduledFlush) {
      return this.scheduledFlush
    }
    this.scheduledFlush = new Promise<void>((resolve) => {
      const runner = () => {
        this.scheduledFrameId = null
        this.flush()
          .catch(error => this.reportError(error))
          .finally(() => {
            this.scheduledFlush = null
            resolve()
            if (this.rerenderRequested && !this.destroyed) {
              this.scheduleFlush()
            }
          })
      }
      if (typeof requestAnimationFrame === "function") {
        this.scheduledFrameId = requestAnimationFrame(runner)
      } else {
        runner()
      }
    })
    return this.scheduledFlush
  }

  private flush(): Promise<void> {
    if (this.destroyed) {
      return this.flushChain
    }
    const requestedVersion = this.currentVersion()
    if (this.renderedVersion === requestedVersion && !this.rerenderRequested) {
      return this.flushChain
    }
    this.rerenderRequested = true
    this.flushChain = this.flushChain.catch(() => undefined).then(async () => {
      while (this.rerenderRequested && !this.destroyed) {
        this.rerenderRequested = false
        const markdown = this.session.getText()
        const processedVersion = this.currentVersion()
        const {blocks} = await this.parser.parse({markdown})
        if (this.destroyed || this.currentVersion() !== processedVersion) {
          this.rerenderRequested = !this.destroyed
          continue
        }
        this.render(blocks)
        this.renderedVersion = processedVersion
      }
    })
    return this.flushChain
  }

  private reportError(error: unknown): void {
    if (this.onError) {
      try {
        this.onError(error)
        return
      } catch (callbackError) {
        console.error("[BlockCraft Markdown Stream] onError callback failed", callbackError)
      }
    }
    console.error("[BlockCraft Markdown Stream] render failed", error)
  }

  private render(blocks: IBlockSnapshot[]) {
    const root = createRootSnapshot(blocks)

    if (!this.rendered) {
      this.renderer.render(this.container, root)
      this.rendered = true
      return
    }

    this.renderer.update(root)
  }
}

function createRootSnapshot(children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id: "markdown-stream-root",
    flavour: "root",
    nodeType: BlockNodeType.root,
    props: {},
    meta: {},
    children,
  }
}
