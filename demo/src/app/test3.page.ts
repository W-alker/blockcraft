import {Component} from "@angular/core";
import {EditorComponent} from '../../../blockcraft/editor'

@Component({
  selector: 'app-test3',
  template: `
    <block-craft-editor></block-craft-editor>
  `,
  styles: [``],
  imports: [
    EditorComponent
  ],
  standalone: true
})
export class Test3Page {
  constructor() {

  }
}
