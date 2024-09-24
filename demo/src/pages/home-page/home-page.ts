import {Component} from "@angular/core";
import {NzInputModule} from "ng-zorro-antd/input";
import {FormsModule} from "@angular/forms";
import {DatePipe, NgForOf, NgIf} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {NzTableModule} from "ng-zorro-antd/table";
import {Overlay} from "@angular/cdk/overlay";
import {TableMenuComponent} from "../../components/table-menu/table-menu";
import {SpacePageHeader} from "../../components/space-page-header/space-page-header";

@Component({
  selector: 'home-page',
  templateUrl: 'home-page.html',
  styleUrls: ['./home-page.scss'],
  standalone: true,
  imports: [NzInputModule, FormsModule, NgForOf, DatePipe, MatIconModule, NzTableModule, NgIf, TableMenuComponent, SpacePageHeader]
})
export class HomePage {

  recentHistoryCards = [
    {
      title: '最近使用',
      type: 'doc',
      lastModified: 1630512000000,
      user: {
        name: '张三',
        id: '1',
      }
    }
  ]

  constructor(
    private overlay: Overlay,
  ) {
  }

}
