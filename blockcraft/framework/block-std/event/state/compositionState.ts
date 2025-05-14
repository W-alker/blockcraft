import {UIEventState} from "../base";

export class CompositionStartState extends UIEventState {

    constructor({event}: { event: CompositionEvent, selection: BlockCraft.Selection }) {
        super(event)
    }
}
