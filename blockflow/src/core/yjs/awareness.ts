import Y from "@core/yjs";
import * as awarenessProtocol from 'y-protocols/awareness.js'

export class BlockFlowAwareness {

  awareness = new awarenessProtocol.Awareness(this.doc);

  constructor(public doc: Y.Doc) {
  }



}
