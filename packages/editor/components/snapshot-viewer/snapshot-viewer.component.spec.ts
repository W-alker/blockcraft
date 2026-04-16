import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {SnapshotViewerComponent} from "./snapshot-viewer.component";

@Component({
  standalone: true,
  imports: [SnapshotViewerComponent],
  template: `<bc-snapshot-viewer [snapshot]="snapshot"></bc-snapshot-viewer>`,
})
class SnapshotViewerHostComponent {
  snapshot: IBlockSnapshot = createRootSnapshot("before")
}

describe("SnapshotViewerComponent", () => {
  it("re-renders when the Angular wrapper input snapshot changes", () => {
    const fixture = TestBed.configureTestingModule({
      imports: [SnapshotViewerHostComponent],
    }).createComponent(SnapshotViewerHostComponent)

    fixture.detectChanges()
    let viewer = fixture.debugElement.query(By.css("bc-snapshot-viewer")).nativeElement as HTMLElement
    expect(viewer.textContent).toContain("before")

    fixture.componentInstance.snapshot = createRootSnapshot("after")
    fixture.detectChanges()

    viewer = fixture.debugElement.query(By.css("bc-snapshot-viewer")).nativeElement as HTMLElement
    expect(viewer.textContent).toContain("after")
  })
})

function createRootSnapshot(text: string): IBlockSnapshot {
  return {
    id: "root-test",
    flavour: "root",
    nodeType: BlockNodeType.root,
    meta: {},
    props: {},
    children: [{
      id: "paragraph-1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      meta: {},
      props: {
        depth: 0,
      },
      children: [{insert: text}],
    }],
  }
}
