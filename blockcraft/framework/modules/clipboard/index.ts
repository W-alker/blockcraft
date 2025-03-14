import {UIEventState, UIEventStateContext} from "../../event/base";
import {EventNames, EventScopeSourceType, EventSourceState} from "../../event";

export class ClipboardManager {

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.event.add(EventNames.copy, this.copy, {blockId: this.doc.rootId})

    this.doc.event.add(EventNames.cut, this.cut, {blockId: this.doc.rootId})

    this.doc.event.add(EventNames.paste, context => {
      const state = context.get('clipboardState')
      state.dataTypes.forEach(v => {
        console.log(`%c${v}`, 'color: red; font-size: large;', state.clipboardData?.getData(v))
      })
    }, {blockId: this.doc.rootId})
  }

  writeText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  copy: BlockCraft.EventHandler = (context) => {
    const state = context.get('clipboardState')
    context.preventDefault()
    const div = document.createElement('div')
    div.appendChild(document.getSelection()!.getRangeAt(0).cloneContents())
    state.clipboardData?.setData('text/plain', this.doc.selection.toString(state.selection))
    state.clipboardData?.setData('text/html', div.innerHTML)
  }

  cut: BlockCraft.EventHandler = (context) => {
    const state = context.get('clipboardState')
    context.preventDefault()

    state.clipboardData?.setData('text/plain', this.doc.selection.toString(state.selection) + '222')

    // 继续触发deleteByCut input事件, 让默认处理程序删除选区内容
    const event = new InputEvent('beforeinput', {
      inputType: 'deleteByCut',
      targetRanges: [new StaticRange(state.selection.raw)]
    })
    this.doc.event.run(
      EventNames.beforeInput,
      UIEventStateContext.from(
        new UIEventState(event),
        new EventSourceState({event, sourceType: EventScopeSourceType.Selection})
      )
    )
  }

}
