import {Injector} from "@angular/core";
import {IBlockSnapshot} from "../block-std";
import {
  StandaloneBlockRenderContext,
  StandaloneBlockRenderContextOptions,
} from "./standalone-render-context";
import {SnapshotRenderer} from "./snapshot-renderer";

export type SnapshotRenderSessionOptions = {
  injector: Injector;
  schemas: BlockCraft.SchemaManager;
} & StandaloneBlockRenderContextOptions;

export class SnapshotRenderSession {
  private readonly renderContext: StandaloneBlockRenderContext;
  private readonly renderer: SnapshotRenderer;

  constructor(private readonly options: SnapshotRenderSessionOptions) {
    this.renderContext = new StandaloneBlockRenderContext({
      readonly: options.readonly,
      embeds: options.embeds,
      resolveAsset: options.resolveAsset,
      dispatchAction: options.dispatchAction,
    });

    this.renderer = new SnapshotRenderer({
      injector: options.injector,
      schemas: options.schemas,
      renderContext: this.renderContext,
    });
  }

  mount(root: IBlockSnapshot, container: HTMLElement) {
    this.renderer.mount(root, container);
  }

  update(root: IBlockSnapshot) {
    this.renderer.update(root);
  }

  destroy() {
    this.renderer.destroy();
    this.renderContext.destroy();
  }
}
