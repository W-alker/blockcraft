import {BlockSelection} from "./variants/block.selection";
import {TextSelection} from "./variants/text.selection";

export * from './base'
export * from './utils'
export * from './type'
export * from './manager'

declare global {
  namespace BlockFlow {
    interface Selection {
      block: typeof BlockSelection
      text: typeof TextSelection
    }

    type SelectionType = keyof Selection;

    type SelectionInstance = {
      [P in SelectionType]: InstanceType<Selection[P]>;
    };
  }
}
