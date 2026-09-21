import {ChangeDetectionStrategy, Component} from '@angular/core'
import {ParagraphBlockModel} from './index'
import {EditableBlockComponent} from '../../framework'
import {applyParagraphDecoration} from './decoration'
import {Subscription} from 'rxjs'

@Component({
  selector: 'p.paragraph-block',
  template: `<span class="bc-paragraph-text edit-container"></span>`,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParagraphBlockComponent extends EditableBlockComponent<ParagraphBlockModel> {
  private decorationSub?: Subscription
  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.syncDecoration()
    this.decorationSub = this.onPropsChange.subscribe(changes => {
      if (changes.has('decoration') || changes.has('textAlign')) this.syncDecoration()
    })
  }
  private syncDecoration() {
    applyParagraphDecoration(this.hostElement, this.props['decoration'], this.props.textAlign)
  }
  override ngOnDestroy() {
    this.decorationSub?.unsubscribe()
    super.ngOnDestroy()
  }
}
