import {Component} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {BlockFlowEditor} from "@editor";
import {EDITOR_CONFIG} from "./doc-page.const";

@Component({
  selector: 'doc-page',
  templateUrl: './doc-page.html',
  styleUrls: ['./doc-page.scss'],
  imports: [
    FormsModule,
    BlockFlowEditor
  ],
  standalone: true
})
export class DocPageComponent {
  protected title = 'doc-page';

  protected editorConfig = EDITOR_CONFIG

}
