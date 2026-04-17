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
  private processing = Promise.resolve()
  private rendered = false
  private renderedSegments: Array<{ range: MarkdownPlannedRange, blocks: IBlockSnapshot[] }> = []

  constructor(private readonly options: MarkdownStreamViewerOptions = {}) {
    this.container = options.container ?? document.createElement("div")
    this.renderer = createSnapshotRenderer(options.viewerOptions ?? {})
  }

  append(chunk: string): void {
    const previousText = this.session.getText()
    this.session.append(chunk)
    this.queueProcess(previousText)
  }

  replace(markdown: string): void {
    const previousText = this.session.getText()
    this.session.replace(markdown)
    this.queueProcess(previousText)
  }

  finish(): void {
    const previousText = this.session.getText()
    this.session.finish()
    this.queueProcess(previousText)
  }

  destroy(): void {
    this.renderer.destroy()
    this.session.destroy()
    this.renderedSegments = []
  }

  private queueProcess(previousText: string) {
    this.processing = this.processing.then(() => this.process(previousText))
  }

  private async process(previousText: string) {
    const nextText = this.session.getText()
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
