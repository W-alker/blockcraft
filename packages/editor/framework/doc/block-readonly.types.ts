import {BlockCraftError, ErrorCode} from "../../global";

export type BlockRef = string | {readonly id: string};

export type BlockReadonlySource =
  | {kind: "document"}
  | {kind: "self"; blockId: string}
  | {kind: "ancestor"; blockId: string}
  | null;

export type BlockReadonlyBlocker =
  | Exclude<BlockReadonlySource, null>
  | {kind: "descendant"; blockId: string};

export interface BlockReadonlyResolution {
  readonly: boolean;
  source: BlockReadonlySource;
}

export enum BlockReadonlyOperation {
  Text = "text",
  Format = "format",
  Props = "props",
  Insert = "insert",
  Delete = "delete",
  Replace = "replace",
  Move = "move",
  Paste = "paste",
  Cut = "cut",
  Undo = "undo",
  Redo = "redo",
}

export type BlockReadonlyViolationTrigger =
  | "input"
  | "clipboard"
  | "drag"
  | "menu"
  | "api"
  | "undo";

export interface BlockReadonlyViolation {
  operation: BlockReadonlyOperation;
  blockIds: readonly string[];
  source: BlockReadonlyBlocker;
  trigger: BlockReadonlyViolationTrigger;
}

export interface BlockReadonlyErrorDetail {
  operation: BlockReadonlyOperation;
  blockIds: readonly string[];
  source: BlockReadonlyBlocker;
}

export class BlockReadonlyError extends BlockCraftError {
  constructor(readonly detail: BlockReadonlyErrorDetail) {
    super(
      ErrorCode.BlockReadonlyError,
      `Readonly block rejected ${detail.operation}: ${detail.blockIds.join(",")}`,
    );
    this.name = "BlockReadonlyError";
  }

  get operation(): BlockReadonlyOperation {
    return this.detail.operation;
  }

  get blockIds(): readonly string[] {
    return this.detail.blockIds;
  }

  get source(): BlockReadonlyBlocker {
    return this.detail.source;
  }
}
