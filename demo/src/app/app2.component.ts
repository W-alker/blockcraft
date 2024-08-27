import {Component, ViewChild} from "@angular/core";
import {BlockFlowEditor, GlobalConfig} from "@editor";
import {genUniqueID, SchemaStore} from "@core";
import {HeadingOneSchema, ParagraphSchema} from "@blocks";

@Component({
  selector: 'app-root2',
  template: `
    <bf-editor [config]="config" #editor></bf-editor>
    <button (click)="onClick()">进入房间</button>
    <button (click)="onClick2()">离开房间</button>
  `,
  imports: [
    BlockFlowEditor
  ],
  standalone: true
})
export class App2Component {

  config: GlobalConfig = {
    rootId: 'root-demo',
    schemas: new SchemaStore([ParagraphSchema, HeadingOneSchema]),
    initModel: []
  }

  @ViewChild('editor') editor!: BlockFlowEditor
  // BlockflowBinding!: BlockflowBinding

  onClick() {
    // this.BlockflowBinding = new BlockflowBinding(this.editor.controller)
  }

  onClick2() {
    // this.BlockflowBinding.leaveRoom()
  }
}
