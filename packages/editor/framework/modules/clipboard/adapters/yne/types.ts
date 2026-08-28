// Clipboard-owned Youdao Note payload types.
import { IBlockSnapshot } from "../../../..";
import { DocFileService } from "../../../..";

export const YNE_JSON_MIME = 'text/yne-json';
export const YNE_IMAGE_JSON_MIME = 'text/yne-image-json';

export interface YneCharStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  color?: string;
  'back-color'?: string;
  'font-size'?: number;
}

export interface YneChar {
  char: string;
  styles?: YneCharStyle;
}

export interface YneRichText {
  data?: YneChar[];
  isRichText?: boolean;
  keepLineBreak?: boolean;
}

export interface YneTableCell {
  cellId?: string;
  mergeWidth?: number;
  mergeHeight?: number;
  mergePointDX?: number;
  mergePointDY?: number;
  content?: { data?: YneRichText[]; type?: string };
}

export interface YneTableData {
  cells?: YneTableCell[];
  heights?: number[];
  widths?: number[];
}

export interface YneBlock {
  blockId?: string;
  blockType: string;
  type?: string;
  styles?: Record<string, unknown> & { align?: string; color?: string; width?: number; height?: number };
  richText?: YneRichText;
  level?: string | number;
  index?: number;
  listId?: string;
  listType?: string;
  checked?: boolean;
  language?: string;
  source?: string;
  resource?: string;
  title?: string;
  fileName?: string;
  fileLength?: number;
  data?: YneTableData;
}

export interface YneImageMap {
  data?: Record<string, { base64?: string }>;
}

export interface YneDeferredAttachment {
  /** Reference to the attachment snapshot; its `.id` is finalized after replaceSnapshotsIdDeeply. */
  snapshot: IBlockSnapshot;
  url: string;
  fileName: string;
  fileLength: number;
}

export interface YneConvertContext {
  /** image source URL -> base64 data URI (from text/yne-image-json) */
  imageMap: Map<string, string>;
  fileService: DocFileService;
}
