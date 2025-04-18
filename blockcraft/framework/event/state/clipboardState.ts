import {UIEventState} from "../base";

export class ClipboardEventState extends UIEventState {

  raw: ClipboardEvent;

  selection: BlockCraft.Selection
  clipboardData: DataTransfer | null

  override type = 'clipboardState';

  constructor({event, selection}: { event: ClipboardEvent, selection: BlockCraft.Selection }) {
    super(event);

    this.raw = event;
    this.selection = selection
    this.clipboardData = event.clipboardData
  }

  get dataTypes() {
    return this.clipboardData?.types ?? []
  }

  getData(type: string) {
    return this.clipboardData?.getData(type) ?? null
  }

}

declare global {
  interface BlockCraftUIEventState {
    clipboardState: ClipboardEventState;
  }
}
