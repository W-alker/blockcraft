import {
  Controller,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  onArrowUp, onBackspace, onCtrlA,
  onCtrlB, onCtrlC, onCtrlI,
  onCtrlU, onCtrlX,
  onCtrlZ, onDelete,
  onEnter,
  onTab
} from "@core";

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
      trigger: (e) => (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlC
    },
    {
      trigger: (e) => (e.code === 'KeyX' && (e.ctrlKey || e.metaKey)),
      handler: onCtrlX
    },
    // {
    //   trigger: (e) => (e.code === 'KeyV' && (e.ctrlKey || e.metaKey)),
    //   handler: onCtrlV
    // },
    {
      trigger: (e) => (e.key === 'Enter' && !e.ctrlKey && !e.metaKey),
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

  addHandler(handler: IHandler) {
    this.handlers.push(handler)
  }

  removeHandler(handler: IHandler) {
    this.handlers.splice(this.handlers.indexOf(handler), 1)
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
