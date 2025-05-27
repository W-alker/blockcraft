import {Component, ViewChild} from "@angular/core";
import {EditorComponent} from '../../../blockcraft/editor'
import {performanceTest} from "../../../blockcraft";
import {Transformer} from "../version-adapter/transformer";
import {OLD_JSON} from "../version-adapter";

@Component({
  selector: 'app-test3',
  template: `
    <block-craft-editor #editor></block-craft-editor>

    <button (click)="onTest()">迁移测试</button>
  `,
  styles: [``],
  imports: [
    EditorComponent
  ],
  standalone: true
})
export class Test3Page {
  @ViewChild('editor', {read: EditorComponent}) editor!: EditorComponent

  constructor() {
  }

  @performanceTest()
  onTest() {
    const snapshots = new Transformer().transform(OLD_JSON)
    console.log(snapshots)
    this.editor.initBySnapshot(snapshots)
  }
}
