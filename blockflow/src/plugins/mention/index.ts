import {BlockflowInline, Controller, IPlugin} from "@core";
import {debounceTime, fromEvent, fromEventPattern, Subscription, take} from "rxjs";
import {MentionDialog} from "./widget/mention-dialog";
import {ComponentRef, ViewContainerRef} from "@angular/core";

export interface IMentionRequest {
  (keyword: string): Promise<IMentionResponse>
}

export interface IMentionResponse {
  list: IMentionData[]
  [key: string]: any
}

export interface IMentionData {
  id: string
  name: string
}

export class MentionPlugin implements IPlugin {
  name = "mention";
  version = 1.0;

  controller!: Controller;

  private _dialog?: ComponentRef<MentionDialog>;

  private _vcr!: ViewContainerRef;
  private _mentionElement?: HTMLElement
  private _rootInputSub: Subscription | null = null;

  private _mentionInputObserver!: MutationObserver;

  constructor(private request: IMentionRequest) {
  }

  init(controller: Controller) {
    this.controller = controller;
    this.subRootInput()
    this._vcr = controller.injector.get(ViewContainerRef)
  }

  subRootInput() {
    this._rootInputSub = fromEvent(this.controller.rootElement, 'input')
      // @ts-ignore
      .subscribe((e: InputEvent) => {
        if (e.data !== '@' || this._mentionElement) return

        const selection = document.getSelection()!
        const node = selection.focusNode! as Text
        const offset = selection.focusOffset
        const parent = node.parentElement!

        if (node.textContent === '@') {
          this.openMention(parent)
          return;
        }

        // delete the '@' character that was just typed
        node.deleteData(offset - 1, 1)

        // create a new element to represent the mention
        const cloneParent = parent.cloneNode() as HTMLElement
        cloneParent.textContent = '@'
        if (offset === 0) {
          parent.before(cloneParent)
        } else if (offset >= node.textContent!.length) {
          parent.after(cloneParent)
        } else {
          const cloneParent2 = parent.cloneNode()
          cloneParent2.textContent = parent.textContent!.slice(offset - 1)
          parent.textContent = parent.textContent!.slice(0, offset - 1)
          parent.after(cloneParent)
          cloneParent.after(cloneParent2)
        }

        this.openMention(cloneParent)
        selection.setPosition(cloneParent.firstChild, 1)
      })
  }

  openMention(element: HTMLElement) {
    const node = element.firstChild!

    this._rootInputSub?.unsubscribe()
    this._rootInputSub = null
    this._mentionElement = element

    this.showMentionDialog(element)

    const mutationSub = fromEventPattern(
      handler => {
        this._mentionInputObserver = new MutationObserver(handler)
        this._mentionInputObserver.observe(node, {characterData: true})
      },
      handler => this._mentionInputObserver.disconnect()
    ).pipe(debounceTime(300)).subscribe(() => {
      this.request(node.textContent!.slice(1)).then((res) => {
        this._dialog!.setInput('list', res.list)
      })
    })

    this._dialog?.instance.itemSelect.pipe(take(1)).subscribe((item: IMentionData) => {
      console.log(item)
      this.setMention(item)
      this.closeMention()
    })

    const keydownSub = fromEvent(element.parentElement!, 'keydown')
      // @ts-ignore
      .subscribe((e: KeyboardEvent) => {
        e.stopPropagation()

        switch (e.key) {
          case 'Enter':
            e.preventDefault()
            this._dialog?.instance.onSure()
            break
          case 'ArrowDown':
            e.preventDefault()
            this._dialog?.instance.moveSelect('down')
            break
          case 'ArrowUp':
            e.preventDefault()
            this._dialog?.instance.moveSelect('up')
            break
        }
      })

    const sub = fromEvent(document, 'selectionchange').pipe(debounceTime(100))
      .subscribe(() => {
        console.log('selectionchange')
        const selection = document.getSelection()
        if (!selection || selection.focusNode !== node) {
          this.closeMention()
          mutationSub.unsubscribe()
          keydownSub.unsubscribe()
          sub.unsubscribe()
        }
      })
  }

  showMentionDialog(element: Element) {
    const rootRect = this.controller.rootElement.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    this._dialog = this._vcr.createComponent(MentionDialog)
    this._dialog.instance.top = rect.top - rootRect.top + rect.height
    this._dialog.instance.left = rect.left - rootRect.left
    this.controller.rootElement.appendChild(this._dialog.location.nativeElement)
  }

  closeMention() {
    this._dialog?.destroy()
    this._dialog = this._mentionElement = undefined
    this._mentionInputObserver.disconnect()
    this.subRootInput()
  }

  setMention(item: IMentionData) {
    const block = this.controller.getFocusingBlockRef()!
    const _range = document.createRange()
    _range.setStartBefore(block.containerEle)
    _range.setEndAfter(this._mentionElement!)
    const end = _range.toString().length
    const len = this._mentionElement!.textContent!.length
    const start = end - len

    const attributes = {
      'd:mentionId': item.id,
      'd:mentionName': item.name,
      ...BlockflowInline.getAttributes(this._mentionElement!)
    }

    const yText = this.controller.getEditableBlockYText(block.id)
    this.controller.transact(() => {
      const mentionNode = BlockflowInline.createView(
        {
          insert: {
            mention: item.name
          },
          attributes
        }
      )
      this._mentionElement!.replaceWith(mentionNode)

      yText.delete(start, len)
      yText.insertEmbed(start, {mention: item.name}, attributes)

      _range.setEndAfter(mentionNode)
      _range.collapse(false)
      document.getSelection()!.removeAllRanges()
      document.getSelection()!.addRange(_range)
    })

    // const deltas = [
    //   {
    //     retain: start,
    //   },
    //   {
    //     delete: len
    //   },
    //   {
    //     insert: ' '
    //   },
    //   {
    //     insert: {
    //       mention: item.name
    //     },
    //     attributes
    //   }
    // ]
    //
    // this.controller.applyDeltaToEditableBlock(block, deltas, true)
  }

  destroy() {
  }
}
