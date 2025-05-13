import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {MermaidBlockModel} from "./index";
import {NgForOf} from "@angular/common";

@Component({
  selector: 'div.mermaid-block',
  template: `
    <div class="head">
      <div class="btn" style="color: #999;">Mermaid</div>
<!--      <div class="template-btn btn" (click)="onShowTemplateList($event, 'prefix')">类型-->
<!--        <i class="bf_icon bf_xiajaintou" style="font-size: .8em"></i>-->
<!--      </div>-->

<!--      <div class="template-btn btn" (click)="onShowTemplateList($event, 'template')">模板 <i-->
<!--        class="bf_icon bf_xiajaintou"></i></div>-->
<!--      <div class="switch-btn btn" (click)="onSwitchView()"><i class="bf_icon bf_qiehuan"></i></div>-->
    </div>

    <div class="container">
      <ng-container #childrenContainer></ng-container>
      <div class="graph-con" #graph></div>
    </div>

<!--    <ng-template #templateListTpl>-->
<!--      <div class="template-list">-->
<!--        <div class="template-list_item" *ngFor="let item of templateList"-->
<!--             (click)="useTemplate(item)">-->
<!--          {{ item.name }}-->
<!--        </div>-->
<!--      </div>-->
<!--    </ng-template>-->

    <div class="graph-con"></div>
  `,
  imports: [
    NgForOf
  ],
  standalone: true
})
export class MermaidBlockComponent extends BaseBlockComponent<MermaidBlockModel> {
  graphContainer!: HTMLDivElement

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.graphContainer = this.hostElement.querySelector('.graph-con') as HTMLDivElement;
  }


}
