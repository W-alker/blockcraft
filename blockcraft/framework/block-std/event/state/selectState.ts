import {UIEventState} from "../base";

type selectTrigger = 'keyboard' | 'mouse';
type selectState = 'start' | 'end'

export class SelectEventState extends UIEventState {
  override type = "selectState";

  trigger: selectTrigger;
  state: selectState;

  constructor(
    {event, trigger, state }: { event: Event, trigger: selectTrigger, state: selectState }
  ) {
    super(event);
    this.trigger = trigger;
    this.state = state;
  }
}

declare global {
  interface BlockCraftUIEventState {
    selectState: SelectEventState;
  }
}
