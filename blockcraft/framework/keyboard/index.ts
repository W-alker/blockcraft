import {Controller} from "../../controller";
import {fromEvent, merge, take, takeUntil} from "rxjs";
import {onArrowUp} from "./default/onArrowUp";
import {onArrowDown} from "./default/onArrowDown";
import {onArrowLeft} from "./default/onArrowLeft";
import {onArrowRight} from "./default/onArrowRight";
import {onBackspace} from "./default/onBackspace";
import {onDelete} from "./default/onDelete";
import {onEnter} from "./default/onEnter";
import {onTab} from "./onTab";
import {onCtrlZ} from "./onCtrlZ";
import {onCtrlC} from "./onCtrlC";
import {onCtrlX} from "./onCtrlX";
import {onCtrlU} from "./onCtrlU";
import {onCtrlI} from "./onCtrlI";
import {onCtrlB} from "./onCtrlB";
import {BLOCK_BINDINGS} from "./block-bindings";

export interface KeyBindingTrigger extends Partial<Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>> {
  key: string | string[]
  shortKey?: boolean // In mac shortKey is meta, in windows it's ctrl
}

const SHORTKEY = /Mac/i.test(navigator.platform) ? 'metaKey' : 'ctrlKey';

export interface KeyBindingHandler<T extends BlockFlow.SelectionType = BlockFlow.SelectionType> {
  (this: { controller: Controller }, event: KeyboardEvent, curSelection: BlockFlow.SelectionInstance[T]): void
}

export interface BindingKeyObject<T extends BlockFlow.SelectionType = BlockFlow.SelectionType> {
  trigger: KeyBindingTrigger
  context: {
    selectionType: string
    group?: string
  }
  handler: KeyBindingHandler<T>
}

export class BlockFlowKeyboard {

  // { [`${selectionType}-${group}`]: {key: BindingKeyObject[]} }
  private bindKeys: Record<string, Record<string, BindingKeyObject[]>> = {}

  constructor(
    public readonly controller: Controller
  ) {
    this.addBindingGroup({selectionType: 'block'}, BLOCK_BINDINGS)

    // this.addBinding({key: 'ArrowUp'}, onArrowUp)
    // this.addBinding({key: 'ArrowDown'}, onArrowDown)
    // this.addBinding({key: 'ArrowLeft'}, onArrowLeft)
    // this.addBinding({key: 'ArrowRight'}, onArrowRight)
    // this.addBinding({key: 'Backspace'}, onBackspace)
    // this.addBinding({key: 'Delete'}, onDelete)
    // this.addBinding({key: 'Enter'}, onEnter)
    // this.addBinding({key: 'Tab'}, onTab)
    // this.addBinding({key: ['z', 'Z'], shortKey: true, shiftKey: false, altKey: false}, onCtrlZ)
    // this.addBinding({key: ['c', 'C'], shortKey: true, shiftKey: false, altKey: false}, onCtrlC)
    // this.addBinding({key: ['x', 'X'], shortKey: true, shiftKey: false, altKey: false}, onCtrlX)
    // this.addBinding({key: ['u', 'U'], shortKey: true, shiftKey: false, altKey: false}, onCtrlU)
    // this.addBinding({key: ['i', 'I'], shortKey: true, shiftKey: false, altKey: false}, onCtrlI)
    // this.addBinding({key: ['b', 'B'], shortKey: true, shiftKey: false, altKey: false}, onCtrlB)
  }

  addBindingGroup(context: BindingKeyObject['context'], bindings: Omit<BindingKeyObject<any>, 'context'>[]) {
    bindings.forEach(binding => this.addBinding(context, binding.trigger, binding.handler))
  }

  addBinding(context: BindingKeyObject['context'], trigger: KeyBindingTrigger, handler: BindingKeyObject['handler']) {
    const prefix = context.group ? `${context.selectionType}-${context.group}` : context.selectionType
    this.bindKeys[prefix] ||= {}
    const keys = Array.isArray(trigger.key) ? trigger.key : [trigger.key]
    keys.forEach((key) => {
      this.bindKeys[prefix][key] ||= []
      if (trigger.shortKey) {
        // @ts-ignore
        trigger[SHORTKEY] = true
        delete trigger.shortKey
      }
      this.bindKeys[prefix][key].push({trigger, context, handler})
    })
  }

  listen() {
    // when the selection is nat at editable block, this will be the focus element to trigger keydown event
    const _virtualFocusElement = document.createElement('input')
    _virtualFocusElement.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 0; height: 0; opacity: 0;'
    document.body.appendChild(_virtualFocusElement)

    this.controller.root.onDestroy.pipe(take(1)).subscribe(() => {
      document.body.removeChild(_virtualFocusElement)
    })

    this.controller.selection.changed$.pipe(takeUntil(this.controller.root.onDestroy))
      .subscribe(selection => {
        if (selection && selection.type !== 'text') {
          _virtualFocusElement.select()
        }
      })

    merge(
      fromEvent<KeyboardEvent>(_virtualFocusElement, 'keydown'),
      fromEvent<KeyboardEvent>(this.controller.rootElement, 'keydown')
    ).pipe(takeUntil(this.controller.root.onDestroy))
      .subscribe((evt) => {
        if (evt.isComposing || evt.defaultPrevented) return
        const curSel = this.controller.selection.currentSelection
        if (!curSel) throw new Error('No selection, this is an unexpected error')
        const bindings = this.bindKeys[curSel.type + '-' + curSel.group] || this.bindKeys[curSel.type]
        if (!bindings) {
          evt.preventDefault()
          return
        }

        const key = evt.key
        const bindingsForKey = bindings[key]
        if (!bindingsForKey.length) return

        for (const binding of bindingsForKey) {
          const isTriggered = Object.entries(binding.trigger).every(([key, value]) => {
            // @ts-ignore
            return evt[key] === value
          })

          if (!isTriggered) continue
          // @ts-ignore
          binding.handler.call(this, evt, curSel)
          break
        }
      })
  }

}



