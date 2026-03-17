import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {FormulaBlockModel} from "./index";
import katex from 'katex';

@Component({
  selector: 'div.formula-block',
  template: `
    <div class="formula-block-container">
      <div class="formula-display" #formulaDisplay></div>
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormulaBlockComponent extends BaseBlockComponent<FormulaBlockModel> implements AfterViewInit {
  @ViewChild('formulaDisplay') formulaDisplay!: ElementRef<HTMLElement>;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.renderFormula();
    this.onPropsChange.subscribe(() => {
      this.renderFormula();
      this.cdr.markForCheck();
    });
  }

  renderFormula() {
    if (!this.formulaDisplay?.nativeElement) return;
    const latex = this.props.latex || '';
    if (!latex) {
      this.formulaDisplay.nativeElement.innerHTML = '<span class="formula-placeholder"><span class="formula-placeholder-icon">T<sub>E</sub>X</span> 添加数学公式</span>';
      return;
    }
    try {
      katex.render(latex, this.formulaDisplay.nativeElement, {
        displayMode: true,
        throwOnError: false,
        output: 'mathml',
      });
    } catch {
      this.formulaDisplay.nativeElement.textContent = latex;
    }
  }
}
