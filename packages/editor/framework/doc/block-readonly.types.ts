import {BlockCraftError, ErrorCode} from "../../global";

export type BlockRef = string | {readonly id: string};

export type BlockLockKind = "user" | "template";

export interface SetBlockReadonlyOptions {
  kind?: BlockLockKind;
}

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
  /** Effective explicit lock owner. Document readonly and unlocked blocks return null. */
  lockUserId: string | null;
  /** Effective lock origin. Document readonly and unlocked blocks return null. */
  lockKind: BlockLockKind | null;
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
  Lock = "lock",
  Unlock = "unlock",
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

export interface BlockUnlockContext {
  blockId: string;
  lockUserId: string;
  lockKind: BlockLockKind;
  currentUserId: string | null;
}

export type BlockLockErrorReason =
  | "missing-user"
  | "root"
  | "inherited"
  | "owned-by-other"
  | "unauthorized";

export interface BlockLockErrorDetail {
  operation: BlockReadonlyOperation.Lock | BlockReadonlyOperation.Unlock;
  reason: BlockLockErrorReason;
  blockId: string;
  lockUserId?: string | null;
  source?: BlockReadonlySource;
}

export class BlockLockError extends BlockCraftError {
  constructor(readonly detail: BlockLockErrorDetail) {
    super(
      ErrorCode.BlockReadonlyError,
      `Block lock rejected ${detail.operation}: ${detail.blockId} (${detail.reason})`,
    );
    this.name = "BlockLockError";
  }

  get operation(): BlockReadonlyOperation.Lock | BlockReadonlyOperation.Unlock {
    return this.detail.operation;
  }

  get reason(): BlockLockErrorReason {
    return this.detail.reason;
  }

  get blockId(): string {
    return this.detail.blockId;
  }

  get lockUserId(): string | null {
    return this.detail.lockUserId ?? null;
  }
}
