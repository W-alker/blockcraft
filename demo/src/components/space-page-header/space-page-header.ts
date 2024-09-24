import {Component} from "@angular/core";
import {NzInputModule} from "ng-zorro-antd/input";
import {FormsModule} from "@angular/forms";

@Component({
  selector: 'space-page-header',
  templateUrl: 'space-page-header.html',
  styleUrls: ['./space-page-header.scss'],
  imports: [
    NzInputModule,
    FormsModule
  ],
  standalone: true
})
export class SpacePageHeader {
  protected searchValue = '';

  constructor() {
  }
}
