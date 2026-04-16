import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
} from "@angular/core";
import {MatIconRegistry} from "@angular/material/icon";
import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {createSnapshotRenderer} from "../../snapshot-viewer/create-snapshot-renderer";
import {SnapshotRenderer, SnapshotViewerOptions} from "../../snapshot-viewer/types";
import {firstValueFrom} from "rxjs";

@Component({
  selector: "bc-snapshot-viewer",
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "class": "bc-snapshot-viewer",
  },
})
export class SnapshotViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() snapshot: IBlockSnapshot | IBlockSnapshot[] | null = null
  @Input() options: SnapshotViewerOptions = {}

  private readonly matIconRegistry = inject(MatIconRegistry, {optional: true})
  private renderer: SnapshotRenderer | null = null
  private viewReady = false

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {
  }

  ngAfterViewInit(): void {
    this.viewReady = true
    this.renderer = createSnapshotRenderer(this.getResolvedOptions())
    this.renderSnapshot()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return
    }

    if (changes["options"]) {
      this.renderer?.destroy()
      this.renderer = createSnapshotRenderer(this.getResolvedOptions())
      this.renderSnapshot()
      return
    }

    if (changes["snapshot"]) {
      this.renderSnapshot(true)
    }
  }

  ngOnDestroy(): void {
    this.renderer?.destroy()
    this.renderer = null
  }

  private renderSnapshot(useUpdate = false) {
    if (!this.renderer || !this.snapshot) {
      return
    }

    if (useUpdate) {
      this.renderer.update(this.snapshot)
      return
    }

    this.renderer.render(this.elementRef.nativeElement, this.snapshot)
  }

  private getResolvedOptions(): SnapshotViewerOptions {
    if (!this.matIconRegistry) {
      return this.options
    }

    return {
      ...this.options,
      resolveSvgIcon: this.options.resolveSvgIcon ?? (async (name: string) => {
        try {
          return await firstValueFrom(this.matIconRegistry!.getNamedSvgIcon(name))
        } catch {
          return null
        }
      }),
    }
  }
}
