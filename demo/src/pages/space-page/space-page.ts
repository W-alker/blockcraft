import {Component, Input} from "@angular/core";
import {SpacePageHeader} from "../../components/space-page-header/space-page-header";
import {ActivatedRoute} from "@angular/router";

@Component({
  selector: 'space-page',
  templateUrl: './space-page.html',
  styleUrls: ['./space-page.scss'],
  imports: [
    SpacePageHeader
  ],
  standalone: true
})
export class SpacePageComponent {
  private spaceId!: string;

  constructor(
    private route: ActivatedRoute
  ) {
    console.log('SpacePageComponent created')
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.spaceId = params['id'];
      console.log('Route parameter changed:', this.spaceId);
    });
  }

  onNewDoc() {

  }
}
