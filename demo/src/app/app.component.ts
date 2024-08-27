import {Component, ViewChild} from '@angular/core';
import {
  BlockFlowEditor,
  GlobalConfig,
  HeadingOneSchema, IBlockModel,
  IEditableBlockModel,
  ParagraphSchema,
  SchemaStore
} from "../../../blockflow/src";
import {genUniqueID} from "@core/utils";

const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema])

interface BlockSchemaMap {
  'paragraph': IEditableBlockModel,
  'heading-one': IEditableBlockModel
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {


}
