import {Component, HostBinding} from "@angular/core";
import {EditableBlock} from "@core";
import {ICalloutBlockModel} from "@blocks/callout/type";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {IToolbarItem} from "../../components";

@Component({
  selector: 'div.callout-block',
  template: `
    <span class="callout-block__emoji">{{props.emoji}}</span>
    <div class="editable-container bf-multi-line" [style.color]="props.color"></div>
  `,
  styles: [`
    :host {
      border: 1px solid #FDB549;
      padding: 8px 8px 8px 42px;
      border-radius: 4px;
      position: relative;
    }

    .callout-block__emoji {
      position: absolute;
      left: 12px;
      top: 8px;
      font-size: 18px;
      text-indent: 0;
      cursor: pointer;
    }

    .callout-block__emoji:hover {
      background-color: rgba(72, 87, 226, 0.3);
      border-radius: 4px;
    }
  `],
  standalone: true,
})
export class CalloutBlock extends EditableBlock<ICalloutBlockModel> {
  @HostBinding('style.backgroundColor')
  protected _backgroundColor: string = '#fcf2eb'

  @HostBinding('style.color')
  protected _color: string = '#333'

  protected TOOLBAR_LIST: IToolbarItem[] = [
    {
      icon: 'bf_icon bf_yanse',
      name: 'color',
      title: '更换颜色'
    },
    {
      name: '|',
    },
    {
      icon: 'bf_icon bf_fuzhi',
      name: 'copy',
      title: '复制文本'
    }
  ]

  override ngOnInit() {
    super.ngOnInit();
    this.setStyle();

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if (v.type === 'props') this.setStyle();
    })
  }

  setStyle() {
    this._backgroundColor !== this.props.backgroundColor && (this._backgroundColor = this.props.backgroundColor);
    this._color !== this.props.color && (this._color = this.props.color);
  }

}
