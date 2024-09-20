import {Component, Input,} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BlockModel, Controller, EditorRoot, IBlockModel} from "@core";
import {BlockWrap} from "@core/block-render/block-wrap";

interface IRequester {
  (page: number): Promise<IResponse>
}

interface IResponse {
  totalCount: number
  data: IBlockModel[]
}

export interface LazyLoadConfig {
  pageSize: number
  requester: IRequester
}

@Component({
  selector: 'div[bf-node-type="root"][lazy-load="true"]',
  template: `
    <ng-container *ngIf="controller">
      <ng-container *ngFor="let block of controller.rootModel; trackBy:trackBy">
        <div bf-block-wrap [controller]="controller" [model]="block"></div>
      </ng-container>
    </ng-container>
  `,
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    BlockWrap,
  ],
  host: {
    '[attr.tabindex]': '0'
  }
})
export class LazyEditorRoot extends EditorRoot {
  @Input({required: true}) config!: LazyLoadConfig

  get model() {
    return this.controller.rootModel
  }

  private pagination = {
    totalCount: 1,
    pageNum: 1
  }

  private lastEle: HTMLElement | null = null
  private parentEle!: HTMLElement
  private parentHeight!: number

  private lastEleIntersection!: IntersectionObserver
  private resizeObserver = new ResizeObserver((entries) => {
    const {height} = entries[0].contentRect
    if (height < this.parentHeight) {
      this.loadMore(this.pagination.pageNum)
    } else {
      const lastIndex = this.model.length - 1
      const id = this.model[lastIndex].id
      this.lastEle && this.lastEleIntersection.unobserve(this.lastEle)
      const cpr = this.controller.getBlockRef(id)!
      this.lastEleIntersection?.observe(cpr.hostEl.nativeElement)
      this.lastEle = cpr.hostEl.nativeElement
    }
  })

  private loadMore(page: number) {
    console.log('loadMore', page, this.model)
    if (this.model.length >= this.pagination.totalCount) {
      this.unobserve()
      return
    }
    return this.config.requester(page).then((res) => {
      const {data, totalCount} = res
      this.pagination.totalCount = totalCount
      this.pagination.pageNum++
      this.controller.transact(() => {
        this.controller.insertBlocks(this.model.length, data.map(BlockModel.fromModel))
      }, Symbol('lazy-load'))
      this.cdr.detectChanges()
      console.log('res', res, this.pagination, this.model)
      return res
    })
  }

  override setController(controller: Controller) {
    super.setController(controller)
    this.observe()
  }

  private observe() {
    this.parentEle = this.elementRef.nativeElement.parentElement!
    this.parentHeight = this.parentEle.clientHeight

    this.lastEleIntersection = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) this.loadMore(this.pagination.pageNum)
    }, {
      root: this.parentEle,
      rootMargin: '0px',
      threshold: 0.5
    })

    this.resizeObserver.observe(this.elementRef.nativeElement)
  }

  private unobserve() {
    this.lastEleIntersection.disconnect()
    this.resizeObserver.disconnect()
  }
}
