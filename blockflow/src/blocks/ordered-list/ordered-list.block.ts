import {ChangeDetectionStrategy, Component} from "@angular/core";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {EditableBlock} from "../../core";
import {IOrderedListBlockModel} from "./type";
import {getNumberPrefix} from "./utils";

@Component({
  selector: 'div.ordered-list',
  template: `
    <span class="order-list__num">{{_numPrefix}}.&nbsp;</span>
    <div class="editable-container"></div>
  `,
  styles: [`
    :host {
      display: flex;
    }
    :host .editable-container {
      flex: 1;
      text-indent: 0;
    }
    .order-list__num {
      color: var(--bf-anchor);
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderedListBlock extends EditableBlock<IOrderedListBlockModel> {
  protected _numPrefix: string = ''

  override ngOnInit() {
    super.ngOnInit()
    this.setOrder()
    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      if (v.type === 'props') {
        this.setOrder()
      }
    })
  }

  private setOrder() {
    this._numPrefix = getNumberPrefix(this.props.order, this.props.indent)
    this.cdr.markForCheck()
    // this.hostEl.nativeElement.setAttribute('data-order', getNumberPrefix(this.props.order, this.props.indent))
  }

}
