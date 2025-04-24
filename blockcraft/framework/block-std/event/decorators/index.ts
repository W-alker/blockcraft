import {EventNames, EventOptions} from "../dispatcher";
import {HotKeyTrigger} from "../control";
import "reflect-metadata"
import {BlockCraftError, ErrorCode} from "../../../../global";

type IDocModuleConstructor<T = {}> = new (...args: any[]) => T;

export function registerClassEvents<U extends BlockCraft.Doc>(this: any, doc: U) {
  const hotKeys = Reflect.getMetadata('hotKeyListeners', this) as string[]
  if (hotKeys?.length) {
    hotKeys.forEach(propKey => {
      // @ts-ignore
      const listener = this[propKey]
      if (typeof listener !== 'function') return
      const events = Reflect.getMetadata('hotKeyOptions', this, propKey)
      if (!events?.length) return
      events.forEach((params: any) => {
        const {binding, options} = params
        doc.event.bindHotkey(binding, listener.bind(this), options)
      })
    })
  }

  const events = Reflect.getMetadata('eventListeners', this) as string[]
  if (events?.length) {
    events.forEach(propKey => {
      // @ts-ignore
      const listener = this[propKey]
      if (typeof listener !== 'function') return
      const events = Reflect.getMetadata('eventOptions', this, propKey)
      if (!events?.length) return
      events.forEach((params: any) => {
        const {name, options} = params
        doc.event.add(name, listener.bind(this), options)
      })
    })
  }

  Reflect.deleteMetadata('hotKeyListeners', this)
  Reflect.deleteMetadata('eventListeners', this)
}

export function DocEventRegister<T extends IDocModuleConstructor>(ctor: T) {
  return class extends ctor {
    constructor(...args: any[]) {
      super(...args);

      const doc = args[0];
      if (!doc || typeof doc !== 'object' || !doc.event) {
        throw new BlockCraftError(ErrorCode.EventDispatcherError, 'Error threw when register doc events: Invalid doc parameter.');
      }

      registerClassEvents.call(this, doc)
    }
  }
}

export function EventListen(name: `${EventNames}`, options?: EventOptions) {
  return function (origin: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const oldEvents = Reflect.getMetadata("eventOptions", origin, propertyKey) || []
    oldEvents.push({name, options})
    Reflect.defineMetadata("eventOptions", oldEvents, origin, propertyKey)

    const oldClassRegisterKeys = Reflect.getMetadata('eventListeners', origin) || []
    oldClassRegisterKeys.push(propertyKey)
    Reflect.defineMetadata('eventListeners', oldClassRegisterKeys, origin)

    return originalMethod
  }
}

export function BindHotKey(binding: HotKeyTrigger, options?: EventOptions) {
  return function (origin: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    const oldEvents = Reflect.getMetadata("hotKeyOptions", origin, propertyKey) || []
    oldEvents.push({binding, options})
    Reflect.defineMetadata("hotKeyOptions", oldEvents, origin, propertyKey)

    const old = Reflect.getMetadata('hotKeyListeners', origin) || []
    old.push(propertyKey)
    Reflect.defineMetadata('hotKeyListeners', old, origin)
    return originalMethod
  }
}
