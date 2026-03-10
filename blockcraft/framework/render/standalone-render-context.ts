import {EmbedConverter, InlineManager} from "../block-std";
import {BlockAction, BlockRenderContext} from "./types";
import {DeltaInsert, DeltaOperation} from "../block-std";

export type StandaloneBlockRenderContextOptions = {
  readonly?: boolean;
  embeds?: [string, EmbedConverter][];
  resolveAsset?: (src: string) => string;
  dispatchAction?: (action: BlockAction) => void;
}

export class StandaloneBlockRenderContext implements BlockRenderContext {
  private readonly inlineManager: InlineManager;
  readonly readonly: boolean;
  readonly resolveAsset?: (src: string) => string;
  readonly dispatchAction?: (action: BlockAction) => void;

  constructor(options: StandaloneBlockRenderContextOptions = {}) {
    this.inlineManager = new InlineManager({
      embeds: options.embeds
    });
    this.readonly = options.readonly ?? true;
    this.resolveAsset = options.resolveAsset;
    this.dispatchAction = options.dispatchAction;
  }

  renderInline(delta: DeltaInsert[], container: HTMLElement) {
    this.inlineManager.render(delta, container);
  }

  patchInline(ops: DeltaOperation[], container: HTMLElement) {
    this.inlineManager.applyDeltaToView(ops, container);
  }

  destroy() {
    this.inlineManager.destroy();
  }
}
