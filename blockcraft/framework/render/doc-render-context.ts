import {BlockRenderContext} from "./types";
import {DeltaInsert, DeltaOperation} from "../block-std";

export class DocBlockRenderContext implements BlockRenderContext {
  constructor(private readonly doc: BlockCraft.Doc) {
  }

  get readonly() {
    return this.doc.isReadonly;
  }

  renderInline(delta: DeltaInsert[], container: HTMLElement) {
    this.doc.inlineManager.render(delta, container);
  }

  patchInline(ops: DeltaOperation[], container: HTMLElement) {
    this.doc.inlineManager.applyDeltaToView(ops, container);
  }
}
