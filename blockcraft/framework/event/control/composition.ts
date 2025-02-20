import {UIEventDispatcher} from "../dispatcher";
import {fromEvent, takeUntil} from "rxjs";

export class CompositionControl {

  isComposing = false

  constructor(private _dispatcher: UIEventDispatcher) {
  }

  listen(root: BlockCraft.IBlockComponents['root']) {
    fromEvent(root.hostElement, 'compositionstart').pipe(takeUntil(root.onDestroy$)).subscribe(() => this.isComposing = true)
    fromEvent(root.hostElement, 'compositionend').pipe(takeUntil(root.onDestroy$)).subscribe(() => this.isComposing = false)
  }

}
