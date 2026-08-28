import {
  DEFAULT_MARKDOWN_ADAPTER_PROFILE,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  MarkdownAdapter,
} from "../../adapters";
import {BUNDLED_ADAPTER_REGISTRY} from '../../editor/bundled-adapter-registry'
import {BlockNodeType} from "../../framework/block-std/types/block.type";
import {DocAttachmentInfo, DocFileService} from "../../framework/services/file.service";
import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {
  MarkdownStreamViewerOptions,
  MarkdownStreamParseInput,
  MarkdownStreamParseResult,
} from "./types";

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

export class MarkdownStreamSnapshotParser {
  private readonly adapter: MarkdownAdapter

  constructor(
    options: Pick<
      MarkdownStreamViewerOptions,
      'adapterRegistry' | 'markdownProfile'
    > = {},
  ) {
    this.adapter = new MarkdownAdapter(
      new MarkdownStreamFileService(),
      new Map<string, string>([[
        MARKDOWN_ADAPTER_PROFILE_CONFIG,
        options.markdownProfile ?? DEFAULT_MARKDOWN_ADAPTER_PROFILE,
      ]]),
      options.adapterRegistry ?? BUNDLED_ADAPTER_REGISTRY,
    )
  }

  async parse(input: MarkdownStreamParseInput): Promise<MarkdownStreamParseResult> {
    const rootSnapshot = await this.adapter.toBlockSnapshot(input.markdown)
    return {
      blocks: normalizeStreamBlocks(rootSnapshot.children as IBlockSnapshot[]),
    }
  }
}

export function normalizeStreamBlocks(blocks: IBlockSnapshot[], prefix = "stream"): IBlockSnapshot[] {
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
