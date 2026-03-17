import {
  DocPlugin,
  EventListen,
  generateId, getPositionWithOffset,
  IBlockTextRange,
  OneShotCursorAnchor,
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
    let {index, block} = selection
    const placeholderAnchor = new OneShotCursorAnchor(this.doc)
    let compositionStartText = ''

    this.doc.crud.transact(() => {
      // 伪造mention-placeholder输入
      this.doc.inlineManager.applyDeltaToView([
        {retain: index},
        {insert: '@', attributes: {'a:mention-placeholder': true}}
      ], block.containerElement)
      block.yText.insert(index, '@')
    }, ORIGIN_SKIP_SYNC)
    placeholderAnchor.capture(block, index)

    const target = block.containerElement.querySelector(`[mention-placeholder]`);
    if (!target || !(target instanceof HTMLElement)) return
    const textNode = target.firstElementChild?.firstChild
    if (!textNode || !(textNode instanceof Text)) return

    this.doc.selection.setCursorAt(block, index + 1)

    const calcPos = () => {
      const point = placeholderAnchor.resolve({block, index})
      if (!point) {
        throw new BlockCraftError(ErrorCode.SelectionError, 'UnExcepted selection')
      }

      block = point.block
      index = point.index

      return {
        block,
        index,
        length: textNode.length
      }
    }

    const getCommittedCompositionText = (ev: CompositionEvent, insertIndex: number) => {
      if (ev.data) return ev.data

      const currentText = textNode.textContent || ''
      if (!currentText) return ''

      if (compositionStartText && currentText.startsWith(compositionStartText)) {
        return currentText.slice(compositionStartText.length)
      }

      const relativeInsertIndex = Math.max(0, insertIndex - index)
      return currentText.slice(relativeInsertIndex)
    }

    const syncPlaceholderTextNode = (insertIndex: number, text: string) => {
      const relativeInsertIndex = Math.max(0, insertIndex - index)
      const nextText = compositionStartText.slice(0, relativeInsertIndex)
        + text
        + compositionStartText.slice(relativeInsertIndex)

      if (textNode.textContent !== nextText) {
        textNode.textContent = nextText
      }

      const selection = document.getSelection()
      if (!selection) return
      selection.setPosition(textNode, Math.min(nextText.length, relativeInsertIndex + text.length))
    }

    const tempBindings = [
      this.doc.event.add('compositionStart', () => {
        compositionStartText = textNode.textContent || ''
        return
      }, {blockId: block.id}),
      // !!!!!!!!! 阻止默认输入法关闭事件
      this.doc.event.add('compositionEnd', ctx => {
        const ev = ctx.getDefaultEvent<CompositionEvent>()
        ev.preventDefault()
        const compositionSession = this.doc.inputManger.compositionSession

        try {
          const placeholderPoint = placeholderAnchor.resolve({block, index}) || {block, index}
          block = placeholderPoint.block
          index = placeholderPoint.index

          const insertPoint = compositionSession.prepareCommit({
            block,
            index: index + 1
          }) || {
            block,
            index: index + 1
          }
          const text = getCommittedCompositionText(ev, insertPoint.index)

          this.doc.crud.transact(() => {
            text && insertPoint.block.yText.insert(insertPoint.index, text, {'a:mention-placeholder': true})
          }, ORIGIN_SKIP_SYNC)
          syncPlaceholderTextNode(insertPoint.index, text)

          const deferred = compositionSession.drainDeferredPatches()
          if (deferred.length) {
            for (const patch of deferred) {
              try {
                const patchBlock = this.doc.getBlockById(patch.blockId)
                if (this.doc.isEditable(patchBlock)) {
                  this.doc.inlineManager.applyDeltaToView(patch.delta, patchBlock.containerElement)
                }
              } catch {
                // deferred patch replay failed; block may have been deleted
              }
            }
          }

          return true
        } finally {
          compositionStartText = textNode.textContent || ''
          compositionSession.end()
        }
      }, {blockId: block.id}),
      // 键盘绑定
      this.doc.event.bindHotkey({key: 'Escape'}, ctx => {
        ctx.preventDefault()
        if (this.doc.event.status.isComposing) return
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
        if (this.doc.event.status.isComposing) return
        dialog.instance.onSure()
        dialog.instance.onTabChange(dialog.instance.activeTabIndex === 0 ? 1 : 0)
        return true
      }, {blockId: block.id}),
    ]

    const {componentRef: dialog} = this.doc.overlayService.createConnectedOverlay<MentionDialog>({
      target,
      component: MentionDialog,
      positions: [getPositionWithOffset('bottom-left'), getPositionWithOffset('top-left'),
        getPositionWithOffset('bottom-right'), getPositionWithOffset('top-right')]
    }, this._closeDialog$, () => {
      tempBindings.forEach(v => v())
      if (!textNode || !textNode.isConnected) {
        placeholderAnchor.reset()
        return
      }
      const {block, index, length} = calcPos()
      placeholderAnchor.reset()
      block.formatText(index, length, {'a:mention-placeholder': null})
    })

    let _tab: MentionType = 'user'

    const searchList = () => {
      if (this.doc.event.status.isComposing) return
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
      const {block, index, length} = calcPos()
      block.applyDeltaOperations([
        {retain: index},
        {delete: length},
        {
          insert: {mention: name},
          attributes: {
            'mentionId': id,
            'mentionType': _tab
          }
        },
        {insert: ' '}
      ]);
      nextTick().then(() => {
        this.doc.selection.setCursorAt(block, index + 2);
      });
      this._closeDialog$.next(true)
    })

  }

  onMentionClick(id: string, type: string, e: MouseEvent) {
    console.log('onMentionClick', id, type, e);
  }

  destroy(): void {
  }

}
