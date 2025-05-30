import {
  DocPlugin,
  EventListen,
  generateId,
  IBlockTextRange,
  ORIGIN_SKIP_SYNC,
  UIEventStateContext
} from "../../../framework";
import {BlockCraftError, characterAtDelta, ErrorCode, nextTick} from "../../../global";
import {debounceTime, fromEventPattern, skip, Subject, takeUntil} from "rxjs";
import {MentionDialog} from "./widget/mention-dialog";
import {IMentionResponse, MentionType} from "./types";

interface IMentionRequest {
  (keyword: string, type: MentionType): Promise<IMentionResponse>
}

export class MentionPlugin extends DocPlugin {
  override name = 'mention';

  private _closeDialog$ = new Subject()

  constructor(private request: IMentionRequest) {
    super();
  }

  init() {
  }

  @EventListen('beforeInput', {flavour: 'root'})
  onBindingInput(ctx: UIEventStateContext) {
    const e = ctx.getDefaultEvent() as InputEvent;
    const curSel = this.doc.selection.value!;
    if (e.data !== '@' || e.isComposing || !curSel.collapsed || curSel.from.type !== 'text' || curSel.from.block.plainTextOnly) return;

    const from = curSel.from
    // @前字符为 空格 时触发
    if (from.index > 0 && characterAtDelta(from.block.textDeltas(), from.index) !== ' ') return;

    e.preventDefault()
    this.openMention(from)
    return true
  }

  @EventListen('mouseDown', {flavour: 'root'})
  onMouseDown(ctx: UIEventStateContext) {
    const e = ctx.getDefaultEvent() as MouseEvent;
    if (e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof HTMLSpanElement) || !target.getAttribute('data-mention-id')) return;
    const id = target.getAttribute('data-mention-id');
    const type = target.getAttribute('data-mention-type');
    this.onMentionClick(id!, type!, e);
    return true;
  }

  openMention(selection: IBlockTextRange) {
    const {index, block} = selection

    this.doc.crud.transact(() => {
      // 伪造mention-placeholder输入
      this.doc.inlineManager.applyDeltaToView([
        {retain: index},
        {insert: '@', attributes: {'a:mention-placeholder': true}}
      ], block.containerElement)
      block.yText.insert(index, '@')
    }, ORIGIN_SKIP_SYNC)

    const target = block.containerElement.querySelector(`[mention-placeholder]`);
    if (!target || !(target instanceof HTMLElement)) return
    const textNode = target.firstElementChild?.firstChild
    if (!textNode || !(textNode instanceof Text)) return

    this.doc.selection.setCursorAt(block, index + 1)

    const calcPos = () => {
      const range = window.document.createRange()
      range.setStart(textNode, 0)
      range.collapse()
      const sel = this.doc.selection.normalizeRange(range)
      if (sel.to || sel.from.type !== 'text') {
        throw new BlockCraftError(ErrorCode.SelectionError, 'UnExcepted selection')
      }
      sel.from.length = textNode.length
      return sel.from
    }

    // 键盘绑定
    const keyBindings = [
      this.doc.event.bindHotkey({key: 'Escape'}, ctx => {
        ctx.preventDefault()
        if (this.doc.event.isComposing) return
        this._closeDialog$.next(true)
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'ArrowUp'}, ctx => {
        ctx.preventDefault()
        dialog.instance.moveSelect('up')
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'ArrowDown'}, ctx => {
        ctx.preventDefault()
        dialog.instance.moveSelect('down')
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'Tab'}, ctx => {
        ctx.preventDefault()
        dialog.instance.onTabChange(dialog.instance.activeTabIndex === 0 ? 1 : 0)
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'Enter'}, ctx => {
        ctx.preventDefault()
        if (this.doc.event.isComposing) return
        dialog.instance.onSure()
        dialog.instance.onTabChange(dialog.instance.activeTabIndex === 0 ? 1 : 0)
        return true
      }, {blockId: block.id}),
    ]

    const {componentRef: dialog} = this.doc.overlayService.createConnectedOverlay<MentionDialog>({
      target,
      component: MentionDialog,
    }, this._closeDialog$, () => {
      keyBindings.forEach(v => v())
      if (!textNode || !textNode.isConnected) return
      const {block, index, length} = calcPos()
      block.formatText(index, length, {'a:mention-placeholder': null})
    })

    let _tab: MentionType = 'user'

    const searchList = () => {
      if (this.doc.event.isComposing) return
      if (!textNode.textContent) return this._closeDialog$.next(true)
      const keyword = textNode.textContent?.trim().slice(1) || ''
      this.request(keyword, _tab).then(res => {
        dialog.setInput('list', res.list)
      })
    }

    // 监听tab change
    dialog.instance.tabChange.pipe(takeUntil(this._closeDialog$)).subscribe(type => {
      _tab = type
      searchList()
    })

    // 监听输入变化 搜索
    let mutationObserver: MutationObserver
    fromEventPattern(
      handler => {
        mutationObserver = new MutationObserver(handler)
        mutationObserver.observe(textNode, {characterData: true})
      },
      () => mutationObserver?.disconnect()
    ).pipe(debounceTime(300), takeUntil(this._closeDialog$)).subscribe(searchList)

    // target失焦关闭时机
    this.doc.selection.changeObserve().pipe(skip(1), takeUntil(this._closeDialog$)).subscribe(v => {
      if (!v || !v.collapsed) return this._closeDialog$.next(true)
      const {startContainer, endContainer} = v?.raw
      if (startContainer !== endContainer || !target.contains(startContainer)) {
        this._closeDialog$.next(true)
      }
    })

    // 确定输入
    dialog.instance.confirm.pipe(takeUntil(this._closeDialog$)).subscribe(({id, name}) => {
      this.doc.crud.transact(() => {
        const {block, index, length} = calcPos()
        block.applyDeltaOperation([
          { retain: index },
          { delete: length },
          {
            insert: { mention: name },
            attributes: {
              'd:mentionId': id,
              'd:mentionType': _tab
            }
          },
          { insert: ' ' }
        ]);
        nextTick().then(() => {
          this.doc.selection.setCursorAt(block, index + 2);
        });
      }, ORIGIN_SKIP_SYNC)
      this._closeDialog$.next(true)
    })

  }

  onMentionClick(id: string, type: string, e: MouseEvent) {
    console.log('onMentionClick', id, type, e);
  }

  destroy(): void {
  }

}
