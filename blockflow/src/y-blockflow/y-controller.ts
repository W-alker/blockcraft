import {Controller} from "@core";
import {WebsocketProvider} from "y-websocket";

export class YController extends Controller<any> {
  wsProvider: WebsocketProvider = new WebsocketProvider('ws://localhost:1234', 'demo-room', this.docManager.doc);

  constructor(config: any) {
    super(config)
    console.log('YController', this.wsProvider)
    this.wsProvider.connect()
    this.wsProvider.on('status', (e: any) => {
      console.log(e.status); // logs "connected" or "disconnected"
    });
    this.wsProvider.on('sync', (e: any) => {
      console.log('sync--------------',e);
    });

    if (config.initModel?.length) {
      this.wsProvider.shouldConnect = false
      this.docManager.transact(() => {
        this.insertBlocks(0, config.initModel)
      }, {})
      this.wsProvider.shouldConnect = false
    }

    this.docManager.doc.on('update', (update, origin, doc, tr) => {
      console.log('%cupdate', 'font-size:large;color: green', origin, doc, tr);
      if(!tr.local) return
    })

    this.docManager.rootYModel.observeDeep((e) => {
      console.log('%cupdate', 'font-size:large;color: yellow',e, e[0].changes);

    })
  }

  override transact(fn: () => void, origin: any = null) {
    if (origin) this.wsProvider.shouldConnect = false
    this.docManager.transact(fn, origin)
    if (origin)this.wsProvider.shouldConnect = false
  }
}
