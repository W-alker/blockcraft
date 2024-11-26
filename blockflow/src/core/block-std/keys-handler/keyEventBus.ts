import {Controller} from "../../controller";
import {onBackspace} from "./onBackspace";
import {onDelete} from "./onDelete";
import {onTab} from "./onTab";
import {onCtrlZ} from "./onCtrlZ";
import {onCtrlC} from "./onCtrlC";
import {onCtrlX} from "./onCtrlX";
import {onEnter} from "./onEnter";
import {onCtrlA} from "./onCtrlA";
import {onCtrlU} from "./onCtrlU";
import {onCtrlI} from "./onCtrlI";
import {onCtrlB} from "./onCtrlB";
import {onArrowUp} from "./onArrowUp";
import {onArrowDown} from "./onArrowDown";
import {onArrowLeft} from "./onArrowLeft";
import {onArrowRight} from "./onArrowRight";


export interface IKeyEventTrigger {
  (event: KeyboardEvent): boolean
}

export interface IKeyEventHandler {
  (event: KeyboardEvent, controller: Controller): void
}

export interface IHandler {
  trigger: IKeyEventTrigger
  handler: IKeyEventHandler
}

export class KeyEventBus {

  private readonly handlers: IHandler[] = [
    {
      trigger: (e) => (e.code === 'Backspace'),
      handler: onBackspace
    },
    {
      trigger: (e) => (e.code === 'Delete'),
      handler: onDelete
    },
    {
      trigger: (e) => (e.code === 'Tab'),
      handler: onTab
    },
    {
      trigger: (e) => (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlZ
    },
    {
      trigger: (e) => (e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && !e.shiftKey),
      handler: onCtrlC
    },
    {
      trigger: (e) => (e.code === 'KeyX' && (e.ctrlKey || e.metaKey) && !e.shiftKey),
      handler: onCtrlX
    },
    {
      trigger: (e) => e.key === 'Enter',
      handler: onEnter
    },
    {
      trigger: (e) => (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlA
    },
    {
      trigger: (e) => (e.code === 'KeyU' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlU
    },
    {
      trigger: (e) => (e.code === 'KeyI' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlI
    },
    {
      trigger: (e) => (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlB
    },
    {
      trigger: (e) => (e.code === 'ArrowUp'),
      handler: onArrowUp
    },
    {
      trigger: (e) => (e.code === 'ArrowDown'),
      handler: onArrowDown
    },
    {
      trigger: (e) => (e.code === 'ArrowLeft'),
      handler: onArrowLeft
    },
    {
      trigger: (e) => (e.code === 'ArrowRight'),
      handler: onArrowRight
    }
  ]

  constructor(public readonly controller: Controller) {
  }

  add(handler: IHandler) {
    this.handlers.push(handler)
  }

  remove(trigger: IKeyEventTrigger) {
    const index = this.handlers.findIndex((handler) => handler.trigger === trigger)
    if (index !== -1) this.handlers.splice(index, 1)
  }

  handle(event: KeyboardEvent) {
    for (const {trigger, handler} of this.handlers) {
      if (trigger(event)) {
        handler(event, this.controller)
        return true
      }
    }
    return false
  }

}
