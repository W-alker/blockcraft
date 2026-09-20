import type {IBlockSnapshot} from '../../block-std/types/block.type';

/** 来源适配只读取剪贴板数据，不依赖具体 ClipboardEvent/浏览器 API。 */
export interface ClipboardSourceData {
  readonly dataTypes: readonly string[];
  getData(type: string): string | null;
}

/**
 * 编辑器粘贴入口的来源扩展，不是通用 HTML/Markdown codec。
 * 解析必须同步；无匹配返回 null，按列表顺序使用第一个有效结果。
 * prepareSnapshot 在克隆和改写 ID 前清理临时数据，可返回下一 tick 执行的资源收尾。
 * 收尾自行确认目标仍存在；原 snapshot 引用可用于获取改写后的 ID。
 */
export interface ClipboardSourceAdapter {
  parseStructured?(data: ClipboardSourceData, doc: BlockCraft.Doc): IBlockSnapshot | null;
  parseHtml?(html: string, doc: BlockCraft.Doc): IBlockSnapshot | null;
  prepareSnapshot?(snapshot: IBlockSnapshot, doc: BlockCraft.Doc): (() => Promise<void>) | void;
}
