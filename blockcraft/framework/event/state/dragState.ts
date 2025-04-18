import {UIEventState} from "../base";

export class DragState extends UIEventState {
  override type = "dragState";

  start: DragEvent | null
  prev: DragEvent | null

  constructor({event, startEvent, prevEvent}: {
    event: DragEvent,
    startEvent: DragEvent | null,
    prevEvent: DragEvent | null
  }) {
    super(event);
    this.start = startEvent;
    this.prev = prevEvent;
  }

}
