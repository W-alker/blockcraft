import {MarkdownAdapter} from "../../adapters/markdown-adapter";
import {BlockNodeType} from "../../framework/block-std/types/block.type";
import {DocAttachmentInfo, DocFileService} from "../../framework/services/file.service";
import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {MarkdownWindowParseInput, MarkdownWindowParseResult} from "./types";

class MarkdownStreamFileService extends DocFileService {
  uploadImg(_: File, __?: (n: number) => void): Promise<string> {
    return Promise.resolve("");
  }

  uploadVideo(_: File, __?: (n: number) => void): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: "", type: "", url: "", size: 0});
  }

  uploadAttachment(_: File, __?: (n: number) => void): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: "", type: "", url: "", size: 0});
  }

  previewImg(_: Record<string, unknown>): void {
  }

  previewAttachment(_: any): void {
  }

  createObjectURL(_: File): string {
    return "";
  }

  getFileByObjectURL(_: string): File | undefined {
    return undefined;
  }

  getFilePreviewURLByObjectURL(_: string): string {
    return "";
  }

  removeObjectURL(_: string): void {
  }

  isLocalObjectURL(_: string): boolean {
    return false;
  }

  isOverMaxSize(_: number): boolean {
    return false;
  }
}

export class MarkdownToSnapshotWindowParser {
  private readonly adapter = new MarkdownAdapter(new MarkdownStreamFileService())

  async parse(input: MarkdownWindowParseInput): Promise<MarkdownWindowParseResult> {
    const rootSnapshot = await this.adapter.toBlockSnapshot(input.markdown)
    const prefix = input.range ? `${input.range.kind}-${input.range.start}` : "window"
    return {
      blocks: normalizeWindowBlocks(rootSnapshot.children as IBlockSnapshot[], prefix),
    }
  }
}

export function normalizeWindowBlocks(blocks: IBlockSnapshot[], prefix = "window"): IBlockSnapshot[] {
  return blocks.map((block, index) => assignStableIds(block, `${prefix}-${index}`))
}

function assignStableIds(block: IBlockSnapshot, prefix: string): IBlockSnapshot {
  const cloned = JSON.parse(JSON.stringify(block)) as IBlockSnapshot
  cloned.id = `${prefix}-${cloned.flavour}`

  if (cloned.nodeType === BlockNodeType.block || cloned.nodeType === BlockNodeType.root) {
    cloned.children = (cloned.children as IBlockSnapshot[]).map((child, index) =>
      assignStableIds(child, `${cloned.id}-${index}`)
    ) as never
  }

  return cloned
}
