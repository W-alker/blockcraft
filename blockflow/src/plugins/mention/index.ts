import {debounceTime, fromEvent, fromEventPattern, Subscription, take, takeUntil, throttleTime} from "rxjs";
import {MentionDialog} from "./widget/mention-dialog";
import {ComponentRef, TemplateRef, ViewContainerRef} from "@angular/core";
import {
  BlockflowInline, BlockFlowSelection,
  Controller,
  EmbedConverter,
  IPlugin,
  USER_CHANGE_SIGNAL
} from "../../core";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";

export interface IMentionRequest {
  (keyword: string, type: MentionType): Promise<IMentionResponse>
}

export type MentionType = 'user' | 'doc'

export interface IMentionResponse {
  list: IMentionData[]

  [key: string]: any
}

export interface IMentionData {
  id: string
  name: string

  [key: string]: string | number | boolean
}

const MENTION_EMBED_CONVERTER: EmbedConverter = {
  toView: (embed) => {
    const span = document.createElement('span')
    span.textContent = embed.insert['mention'] as string
    BlockflowInline.setAttributes(span, embed.attributes!)
    return span
  },
  toDelta: (ele) => {
    return {
      insert: {mention: ele.textContent!},
      attributes: BlockflowInline.getAttributes(ele)
    }
  }
}

export class MentionPlugin implements IPlugin {
  name = "mention";
  version = 1.0;

  controller!: Controller;

  private overlayRef?: OverlayRef
  private _dialog?: ComponentRef<MentionDialog>;
  protected _activeTab: `${MentionType}` = 'user'

  private _vcr!: ViewContainerRef;
  private _mentionElement?: HTMLElement

  private _clickSub?: Subscription
  private _rootInputSub: Subscription | null = null;

  private _mentionInputObserver!: MutationObserver;

  constructor(private request: IMentionRequest,
              private tpl?: TemplateRef<{ item: IMentionData, type: MentionType }>,
              private onMentionClick?: (attrs: {
                mentionId: string,
                mentionType: string
              }, event: MouseEvent, controller: Controller) => void
  ) {
  }

  init(controller: Controller) {
    this.controller = controller;
    this.controller.inlineManger.embedConverterMap.set('mention', MENTION_EMBED_CONVERTER)

    this.subRootInput()
    this._vcr = controller.injector.get(ViewContainerRef)

    if (this.onMentionClick) {
      this._clickSub = fromEvent<MouseEvent>(controller.rootElement, 'click')
        .subscribe((e) => {
          const target = e.target as HTMLElement
          if (!target.dataset['mentionId']) return
          this.onMentionClick!(target.dataset as any, e, controller)
        })
    }
  }

  subRootInput() {
    this._rootInputSub = fromEvent<InputEvent>(this.controller.rootElement, 'input')
      .subscribe((e) => {
        if (e.data !== '@' || this._mentionElement || this.controller.activeElement?.classList.contains('bf-plain-text-only')) return

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
    this._activeTab = 'user'
    this._mentionElement = element
    const node = this._mentionElement.firstChild!

    this._rootInputSub?.unsubscribe()
    this._rootInputSub = null

    this.showMentionDialog()

    const search = () => {
      const keyword = node.textContent!.slice(1)
      this.request(keyword, this._activeTab).then((res) => {
        this._dialog!.setInput('list', res.list)
      })
    }

    search()
    // MutationObserver is used to detect changes in the text node
    fromEventPattern(
      handler => {
        this._mentionInputObserver = new MutationObserver(handler)
        this._mentionInputObserver.observe(node, {characterData: true})
      },
      handler => this._mentionInputObserver.disconnect()
    ).pipe(debounceTime(300), takeUntil(this._dialog!.instance.close)).subscribe(search)

    // 监听元素销毁
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && Array.from(mutation.removedNodes).includes(element)) {
          this.closeMention()
          observer.disconnect()
          break
        }
      }
    });
    observer.observe(element.parentElement!, {childList: true});

    // 失焦关闭
    const sub = fromEvent(document, 'selectionchange')
      .subscribe(() => {
        const selection = document.getSelection()
        if (!selection || selection.focusNode?.parentElement !== this._mentionElement) {
          this.closeMention()
          sub.unsubscribe()
        }
      })

    this._dialog?.instance.tabChange.pipe(takeUntil(this._dialog?.instance.close)).subscribe((type: MentionType) => {
      this._activeTab = type
    })

    this._dialog?.instance.itemSelect.pipe(take(1)).subscribe((item: IMentionData) => {
      this.setMention(item)
      this.closeMention()
    })

    fromEvent<KeyboardEvent>(element.parentElement!, 'keydown').pipe(takeUntil(this._dialog!.instance.close))
      .subscribe((e) => {
        switch (e.key) {
          case 'Enter':
            e.preventDefault()
            e.stopPropagation()
            if (e.isComposing) return
            this._dialog?.instance.onSure()
            break
          case 'ArrowDown':
            e.preventDefault()
            e.stopPropagation()
            this._dialog?.instance.moveSelect('down')
            break
          case 'ArrowUp':
            e.preventDefault()
            e.stopPropagation()
            this._dialog?.instance.moveSelect('up')
            break
          case 'Escape':
            e.preventDefault()
            e.stopPropagation()
            this.closeMention()
            break
          case 'Tab':
            e.preventDefault()
            e.stopPropagation()
            this._dialog?.setInput('list', [])
            this._dialog?.instance.activeTabIndex === 0 ? this._dialog?.instance.onTabChange(1) : this._dialog?.instance.onTabChange(0)
            search()
            break
          default:
            break
        }
      })
  }

  showMentionDialog() {
    if (!this._mentionElement) return
    const overlay = this.controller.injector.get(Overlay)
    const portal = new ComponentPortal(MentionDialog, this._vcr)
    this.overlayRef = overlay.create({
      positionStrategy: overlay.position().flexibleConnectedTo(this._mentionElement).withPush(false)
        .withPositions([
          {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4},
          {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4},
        ]),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    this._dialog = this.overlayRef.attach(portal)
    this.tpl && this._dialog.setInput('template', this.tpl)
    this.overlayRef.backdropClick().pipe(take(1)).subscribe(() => {
      this.closeMention()
    })
  }

  closeMention() {
    this.overlayRef?.dispose()
    this._dialog = this._mentionElement = this.overlayRef = undefined
    this._mentionInputObserver.disconnect()
    this.subRootInput()
  }

  setMention(item: IMentionData) {
    if (!this._mentionElement) return
    const block = this.controller.getFocusingBlockRef()!
    const yText = block!.yText

    const selection = document.getSelection()!
    selection.setPosition(this._mentionElement.firstChild!, 0)
    const len = this._mentionElement.textContent!.length
    const range = BlockFlowSelection.getCurrentCharacterRange(this.controller.activeElement!)

    const attributes = {
      'd:mentionId': item.id,
      'd:mentionType': this._activeTab,
      ...BlockflowInline.getAttributes(this._mentionElement!)
    }

    const delta = {insert: {mention: item.name}, attributes}
    const mentionNode = this.controller.inlineManger.createView(delta)
    this.controller.transact(() => {
      // view update
      this._mentionElement!.replaceWith(mentionNode)

      // sync yText
      yText.delete(range.start, len)
      yText.insertEmbed(range.start, delta.insert, attributes)

      // selection update
      const _range = selection.getRangeAt(0)
      _range.setEndAfter(mentionNode)
      _range.collapse(false)
    }, USER_CHANGE_SIGNAL)
  }

  destroy() {
    this._clickSub?.unsubscribe()
    this._rootInputSub?.unsubscribe()
  }
}
