import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {createSnapshotRenderer} from "../create-snapshot-renderer";
import {SnapshotRenderer} from "../types";
import {planMarkdownStream} from "./stream-planner";
import {MarkdownStreamSession} from "./stream-session";
import {MarkdownToSnapshotWindowParser} from "./window-parser";
import {MarkdownPlannedRange, MarkdownStreamViewer, MarkdownStreamViewerOptions} from "./types";

export class SnapshotViewerStreamEngine implements MarkdownStreamViewer {
  private readonly session = new MarkdownStreamSession()
  private readonly parser = new MarkdownToSnapshotWindowParser()
  private readonly renderer: SnapshotRenderer
  private readonly container: HTMLElement
  private flushChain: Promise<void> = Promise.resolve()
  private rendered = false
  private renderedSegments: Array<{ range: MarkdownPlannedRange, blocks: IBlockSnapshot[] }> = []
  private lastProcessedText = ""
  private renderedKey: string | null = null
  private rerenderRequested = false
  private scheduledFlush: Promise<void> | null = null
  private scheduledFrameId: number | null = null
  private destroyed = false

  constructor(private readonly options: MarkdownStreamViewerOptions = {}) {
    this.container = options.container ?? document.createElement("div")
    this.renderer = createSnapshotRenderer(options.viewerOptions ?? {})
  }

  append(chunk: string): void {
    this.session.append(chunk)
    this.scheduleFlush()
  }

  replace(markdown: string): void {
    this.session.replace(markdown)
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
    this.renderedSegments = []
    this.lastProcessedText = ""
    this.renderedKey = null
  }

  private computeKey(): string {
    return `${this.session.getText()}|${this.session.isFinalized() ? 1 : 0}`
  }

  private scheduleFlush(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve()
    }
    if (this.scheduledFlush) {
      return this.scheduledFlush
    }
    this.scheduledFlush = new Promise<void>((resolve, reject) => {
      const runner = () => {
        this.scheduledFrameId = null
        this.flush()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.scheduledFlush = null
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
    const currentKey = this.computeKey()
    if (this.renderedKey === currentKey && !this.rerenderRequested) {
      return this.flushChain
    }
    this.rerenderRequested = true
    this.flushChain = this.flushChain.then(async () => {
      while (this.rerenderRequested && !this.destroyed) {
        this.rerenderRequested = false
        const previousText = this.lastProcessedText
        const nextText = this.session.getText()
        await this.process(previousText, nextText)
        this.lastProcessedText = nextText
        this.renderedKey = this.computeKey()
        if (this.renderedKey !== currentKey) {
          // text changed during async work -- loop again
          this.rerenderRequested = true
        }
      }
    })
    return this.flushChain
  }

  private async process(previousText: string, nextText: string) {
    const plan = planMarkdownStream({
      previousText,
      nextText,
      finalized: this.session.isFinalized(),
    })

    const ranges = this.session.isFinalized()
      ? [...plan.readyRanges, ...plan.provisionalRanges, ...plan.pendingRanges]
      : [...plan.readyRanges, ...plan.provisionalRanges]

    const preservedSegments = this.renderedSegments.filter(
      (segment) => segment.range.end <= plan.reparseStart && segment.range.state === "stable"
    )
    const nextSegments = [
      ...preservedSegments,
      ...(await this.parseRanges(ranges)),
    ]
    this.renderedSegments = nextSegments
    const blocks = nextSegments.flatMap((segment) => segment.blocks)
    const root = createRootSnapshot(blocks)

    if (!this.rendered) {
      this.renderer.render(this.container, root)
      this.rendered = true
      return
    }

    this.renderer.update(root)
  }

  private async parseRanges(ranges: MarkdownPlannedRange[]) {
    const segments: Array<{ range: MarkdownPlannedRange, blocks: IBlockSnapshot[] }> = []
    for (const range of ranges) {
      const parsed = await this.parser.parse({
        markdown: range.text,
        range,
      })
      segments.push({
        range,
        blocks: parsed.blocks,
      })
    }
    return segments
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
