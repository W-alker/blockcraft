import {Controller, ICharacterRange} from "@core";
import {WebsocketProvider} from "y-websocket";
import {Awareness} from "y-protocols/awareness";
import Y from "@core/yjs";

export class BlockflowBinding {

  provider = new WebsocketProvider('ws://196.168.1.52:1234',
    this.controller.rootId,
    this.controller.docManager.doc, {
    connect: false,
  });

  get doc() {
    return this.controller.docManager.doc
  }

  _awareness: Awareness = this.provider.awareness
  _userName = 'user' + Date.now()

  constructor(
    public controller: Controller
  ) {
    // fromEvent(controller.rootElement)

    // doc.on('update', (update, origin, doc, tr) => {
    //   console.log('%cupdate', 'font-size:large;color: green', update, origin, doc, tr);
    //   if (!tr.local) return
    // })

    this._awareness.setLocalStateField('user', {
      name: this._userName,
    })

    this.controller.docManager.rootYModel.observeDeep((e, tr) => {
      if (!tr.local) {
        this.controller.syncYEventUpdate(e, tr)
      }
    })
  }

  updateCursor(ytext: Y.Text, pos: ICharacterRange) {
    const relPos = Y.createRelativePositionFromTypeIndex(ytext, pos.start, pos.end - pos.start)
    const parsedRelPos = JSON.parse(JSON.stringify(relPos))
    const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, this.doc)
    console.log('updateCursor', parsedRelPos, absPos)
    this._awareness.setLocalStateField('cursor', {
      anchor: {
        id: (ytext.parent as Y.Map<any>).get('id'),
        ...pos
      },
    })
  }

  connect() {
    this.provider.connect()
    this.provider.on('sync', (isSynced: boolean) => {
      if (!isSynced) return
      console.log('synced')
    })
    this._awareness.on('change', (t: any) => {
      // console.log('awareness-----change', t, this._awareness.getStates())
      const {added, updated, removed} = t
      const states = this._awareness.getStates()
      if (added.length) {
        for (const id of added) {
          const state = states.get(id)
          alert(state?.['user'].name + ' 进入房间')
        }
      }
    })
  }

  destroy() {
  }

}
