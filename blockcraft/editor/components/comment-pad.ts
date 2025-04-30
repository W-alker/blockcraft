import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {CommentPad} from "../../plugins/float-text-toolbar";
import {MyCommentService} from "../services/comment.service";

@Component({
  selector: "comment-pad",
  template: `
    <div class="input-wrapper">
      <input placeholder="输入评论……" [(ngModel)]="value" (keydown.enter)="$event.preventDefault(); onSubmit()"
             (keydown.escape)="onCancel.emit()"
             #inputEle/>
    </div>

    <i class="bc_icon bc_xuanzhong icon-confirm" [class.disabled]="isDisabled"
       (mousedown)="$event.preventDefault(); onSubmit()"></i>
  `,
  styles: [`
    :host {
      width: 300px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      background: #FFF;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
      font-size: 14px;
      color: #333;
      padding: 12px;

      .input-wrapper {
        flex: 1;
        display: flex;
        align-items: flex-end;
        gap: 8px;
        border-radius: 4px;
        border: 1px solid #E6E6E6;
        padding: 4px 8px;
        margin: 0;

        &:focus-within {
          border-color: #4857E2;
        }

        &.is-error {
          border-color: #ff4d4f !important;
        }

        > input {
          width: 100%;
          outline: none;
          margin: 0;
          border: none;
        }

        > span {
          color: #999;
          font-size: 14px;
        }
      }

      .icon-confirm {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        font-size: 20px;
        color: #666;
        cursor: pointer;
        border-radius: 4px;

        &.disabled {
          cursor: not-allowed;

          &:hover {
            background-color: transparent;
          }
        }

        &:hover {
          background-color: rgba(153, 153, 153, 0.2);
        }
      }
    }
  `],
  standalone: true,
  imports: [
    FormsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditorCommentPad extends CommentPad {

  override set value(val: string) {
    this._value = val;
    this.isDisabled = !val
  }

  isDisabled = true

  constructor(
    protected commentService: MyCommentService,
  ) {
    super();
  }

  ngOnInit() {
  }

  override onSubmit() {
    if (this.isDisabled || this.selection.from.type !== 'text') {
      return;
    }

    const block = this.doc.getBlockById(this.selection.from.blockId)
    if (!this.doc.isEditable(block)) return;
    this.commentService.addComment(this.value, this.commentId).then(c => {
      if(this.selection.from.type !== 'text') return
      block.formatText(this.selection.from.index, this.selection.from.length, {'d:comment': c.id})
      this.close()
    })
  }
}
