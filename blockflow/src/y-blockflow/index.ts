import {WebsocketProvider} from "y-websocket";
import {Awareness, removeAwarenessStates} from "y-protocols/awareness";
import {Controller} from "../core";
import {first, Subject} from "rxjs";
import Y from '../core/yjs/index'

interface IConfig {
  serverUrl: string
  roomName?: string
}

interface IAwarenessUser {
  userId: string
  userName?: string
}

export class BlockflowBinding {

  provider = new WebsocketProvider(this.config.serverUrl,
    this.config.roomName || this.controller.rootId,
    this.controller.yDoc,
    {
      connect: false,
    }
  );

  get yDoc() {
    return this.controller.yDoc
  }

  protected statesMap = new Map<number, { [p: string]: any }>()
  public readonly userStateUpdated$ = new Subject<{
    user: IAwarenessUser[]
    type: 'added' | 'removed' | 'updated'
  }>()
  public readonly awareness: Awareness = this.provider.awareness

  constructor(
    public controller: Controller,
    public readonly config: IConfig
  ) {
    this.awareness.setLocalStateField('user', this.controller.config.localUser)

    // fromEvent(document, 'selectionchange').subscribe(e => {
    //   const sel = this.controller.getSelection()
    //   this.awareness.setLocalStateField('selection', sel)
    // })
  }

  // updateCursor(ytext: Y.Text, pos: ICharacterRange) {
  //     const relPos = Y.createRelativePositionFromTypeIndex(ytext, pos.start, pos.end - pos.start)
  //     const parsedRelPos = JSON.parse(JSON.stringify(relPos))
  //     const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, this.yDoc)
  //     console.log('updateCursor', parsedRelPos, absPos)
  //     this.awareness.setLocalStateField('cursor', {
  //         anchor: {
  //             id: (ytext.parent as Y.Map<any>).get('id'),
  //             ...pos
  //         },
  //     })
  // }

  connect() {
    this.provider.connect()

    // this.yDoc.once('update', (u) => {
    //   console.log('u', u)
    //   // 将 Uint8Array 转换为 Base64 字符串
    //   const base64String = btoa(String.fromCharCode(...u));
    //   localStorage.setItem('update', base64String)
    // })
    //
    // const savedUpdate = localStorage.getItem('update');
    // if (savedUpdate) {
    //
    //   // 从 localStorage 获取 Base64 字符串并转换回 Uint8Array
    //   const savedBase64 = localStorage.getItem('update');
    //   if (savedBase64) {
    //     const decodedString = atob(savedBase64);
    //     const savedUint8Array = new Uint8Array(decodedString.length);
    //     for (let i = 0; i < decodedString.length; i++) {
    //       savedUint8Array[i] = decodedString.charCodeAt(i);
    //     }
    //
    //     // 将增量更新应用到 doc2
    //     Y.applyUpdate(this.yDoc, savedUint8Array);
    //
    //   }
    // }

    this.awareness.on('change', this.onAwarenessChange)
    this.controller.root.onDestroy.pipe(first()).subscribe(() => {
      this.destroy()
    })
  }

  getCurrentUsers(): IAwarenessUser[] {
    return Array.from(this.statesMap).map(v => v[1]['user'])
  }

  private onAwarenessChange = (t: any) => {
    const {added, updated, removed} = t
    if (added.length) {
      const states = this.awareness.getStates()
      if (!this.statesMap.size) {
        this.statesMap = new Map(states)
        this.userStateUpdated$.next({
          user: this.getCurrentUsers(),
          type: 'added'
        })
      } else {
        for (const id of added) {
          const state = states.get(id)!
          this.statesMap.set(id, state)
        }
        this.userStateUpdated$.next({
          user: added.map((id: number) => ({user: this.statesMap.get(id)?.['user']})),
          type: 'added'
        })
      }
    }
    if (removed.length) {
      this.userStateUpdated$.next({
        type: 'removed',
        user: removed.map((id: number) => ({user: this.statesMap.get(id)?.['user']}))
      })
      for (const id of removed) {
        this.statesMap.delete(id)
      }
    }
  }

  disconnect(origin: any = null) {
    this.awareness.off('change', this.onAwarenessChange)
    removeAwarenessStates(
      this.awareness, [this.yDoc.clientID], origin
    )
    this.provider.disconnect()
  }

  destroy() {
    this.disconnect()
    this.provider.destroy()
  }

}
