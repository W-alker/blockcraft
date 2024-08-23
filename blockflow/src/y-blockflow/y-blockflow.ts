import {Controller, DeltaOperation, EditableBlock} from "@core";
import {WebsocketProvider} from "y-websocket";
import Y from '@core/yjs'

export class BlockflowBinding {

    provider =  new WebsocketProvider('ws://localhost:1234', 'root-demo', this.controller.docManager.doc);

    constructor(
        public controller: Controller<any>
    ) {
        console.log('BlockflowBinding', this.provider);

        const doc = this.controller.docManager.doc

        this.provider.on('status', (e: any) => {
            console.log(e.status); // logs "connected" or "disconnected"
        });

        doc.on('update', (update, origin, doc, tr) => {
            console.log('%cupdate', 'font-size:large;color: green', update, origin, doc, tr);
            if(!tr.local) return
        })

        this.controller.docManager.rootYModel.observeDeep((e) => {
            console.log('%cupdate', 'font-size:large;color: yellow',e, e[0].changes);

        })

    }


}
