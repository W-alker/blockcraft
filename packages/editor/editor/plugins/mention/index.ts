import {
  DocPlugin,
  EventListen,
  OneShotCursorAnchor,
  UIEventStateContext
} from "../../../framework";
import {characterAtDelta, nextTick} from "../../../global";
import {debounceTime, skip, Subject, takeUntil} from "rxjs";
import {MentionDialog} from "./widget/mention-dialog";
import {IMentionResponse, MentionType} from "./types";

interface IMentionRequest {
  (keyword: string, type: MentionType): Promise<IMentionResponse>
}

export class MentionPlugin extends DocPlugin {
  override name = 'mention';

  private _closeDialog$ = new Subject()
  private _isMentionOpen = false

  constructor(private request: IMentionRequest) {
    super();
  }

  init() {
  }

  @EventListen('beforeInput', {flavour: 'root'})
  onBindingInput(ctx: UIEventStateContext) {
    if (this._isMentionOpen) return

    const e = ctx.getDefaultEvent() as InputEvent;
    const curSel = this.doc.selection.value!;
    if (e.data !== '@' || e.isComposing || !curSel.collapsed || curSel.from.type !== 'text' || curSel.from.block.plainTextOnly) return;

    const from = curSel.from
    // @前字符为 空格 时触发
    if (from.index > 0 && characterAtDelta(from.block.textDeltas(), from.index) !== ' ') return;

    // 不 preventDefault，让 @ 走 InputTransformer 正常流程
    // yText、blot、DOM 通过标准管道保持一致
    const block = from.block
    const atIndex = from.index
    this._isMentionOpen = true
    nextTick().then(() => {
      if (!this._tryOpenMention(block, atIndex)) {
        this._isMentionOpen = false
      }
    })
  }

  @EventListen('mouseDown', {flavour: 'root'})
  onMouseDown(ctx: UIEventStateContext) {
    this._closeDialog$.next(true)

    const e = ctx.getDefaultEvent() as MouseEvent;
    if (e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof HTMLSpanElement) || !target.getAttribute('data-mention-id')) return;
    const id = target.getAttribute('data-mention-id');
    const type = target.getAttribute('data-mention-type');
    this.onMentionClick(id!, type!, e);
    return true;
  }

  private _tryOpenMention(block: any, atIndex: number): boolean {
    // 验证 @ 已经被 InputTransformer 写入 yText
    if (block.yText.toString().charAt(atIndex) !== '@') return false

    // 从原生 Selection 获取 @ 的屏幕坐标（不依赖 blot tree）
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return false
    let atRect: DOMRect
    try {
      const range = document.createRange()
      range.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - 1))
      range.setEnd(sel.anchorNode, sel.anchorOffset)
      atRect = range.getBoundingClientRect()
    } catch {
      return false
    }
    if (!atRect.width && !atRect.height) return false

    let index = atIndex
    const anchor = new OneShotCursorAnchor(this.doc)
    anchor.capture(block, index)

    // 从 yText 提取关键词（不依赖 blot tree，通过 anchor 处理协作冲突）
    const getKeyword = (): string | null => {
      const point = anchor.resolve({block, index})
      if (!point) return null
      block = point.block
      index = point.index
      const text = block.yText.toString()
      if (text.charAt(index) !== '@') return null
      const curSel = this.doc.selection.value
      if (!curSel || !curSel.collapsed || curSel.from.type !== 'text' || curSel.from.block !== block) return null
      const cursorIndex = curSel.from.index
      if (cursorIndex <= index) return null
      const keyword = text.slice(index + 1, cursorIndex)
      if (/\s/.test(keyword)) return null
      return keyword
    }

    const tempBindings = [
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
        return true
      }, {blockId: block.id}),
    ]

    const observedBlock = block

    const {componentRef: dialog} = this.doc.overlayService.createGlobalOverlay<MentionDialog>({
      component: MentionDialog,
      top: `${atRect.bottom}px`,
      left: `${atRect.left}px`,
    }, this._closeDialog$, () => {
      this._isMentionOpen = false
      tempBindings.forEach(v => v())
      anchor.reset()
    })

    let _tab: MentionType = 'user'

    const searchList = () => {
      if (this.doc.event.status.isComposing) return
      const keyword = getKeyword()
      if (keyword === null) {
        this._closeDialog$.next(true)
        return
      }
      this.request(keyword, _tab).then(res => {
        dialog.setInput('list', res.list)
      })
    }

    // 初始搜索
    this.request('', _tab).then(res => {
      dialog.setInput('list', res.list)
    })

    // Tab 切换 (skip ngOnInit emission)
    dialog.instance.tabChange.pipe(skip(1), takeUntil(this._closeDialog$)).subscribe(type => {
      _tab = type
      searchList()
    })

    // 文本变化时搜索（本地输入、IME 提交、远程编辑都会触发）
    // debounce 300ms 批处理快速变化；getKeyword() 每次验证上下文
    observedBlock.onTextChange
      .pipe(debounceTime(300), takeUntil(this._closeDialog$))
      .subscribe(searchList)

    // 确认：替换 @keyword 为 mention embed
    // 参照 TipTap/Slate 模式：从文档模型计算替换范围
    dialog.instance.confirm.pipe(takeUntil(this._closeDialog$)).subscribe(({id, name}) => {
      const point = anchor.resolve({block, index})
      if (point) {
        block = point.block
        index = point.index
      }
      const text = block.yText.toString()
      if (text.charAt(index) !== '@') return

      // 从 selection 或 yText 扫描确定 @keyword 的结束位置
      const curSel = this.doc.selection.value
      let end: number
      if (curSel?.collapsed && curSel.from.type === 'text'
        && curSel.from.block === block && curSel.from.index > index) {
        end = curSel.from.index
      } else {
        // fallback：从 @ 往后扫到空白字符
        end = index + 1
        while (end < text.length && !/\s/.test(text.charAt(end))) end++
      }

      block.applyDeltaOperations([
        {retain: index},
        {delete: end - index},
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

    return true
  }

  onMentionClick(id: string, type: string, e: MouseEvent) {
    console.log('onMentionClick', id, type, e);
  }

  destroy(): void {
  }

}
