import {EventNames, EventOptions} from "../dispatcher";
import {HotKeyTrigger} from "../control";
import "reflect-metadata"

type IDocModuleConstructor<T = {}> = new (...args: any[]) => T;

export function DocEventRegister<T extends IDocModuleConstructor>(ctor: T) {
  return class extends ctor {
    constructor(...args: any[]) {
      super(...args);

      const doc = args[0];
      if (!doc || typeof doc !== 'object' || !doc.event) {
        throw new Error('Invalid doc parameter.');
      }

      const hotKeys = Reflect.getMetadata('hotKeyListeners', this) as string[]
      if (hotKeys?.length) {
        hotKeys.forEach(propKey => {
          // @ts-ignore
          const listener = this[propKey]
          if (typeof listener !== 'function') return
          const params = Reflect.getMetadata('hotKeyOptions', this, propKey)
          const {binding, options} = params
          doc.event.bindHotkey(binding, listener.bind(this), options)
        })
      }

      const events = Reflect.getMetadata('eventListeners', this) as string[]
      if (events?.length) {
        events.forEach(propKey => {
          // @ts-ignore
          const listener = this[propKey]
          if (typeof listener !== 'function') return
          const params = Reflect.getMetadata('eventOptions', this, propKey)
          const {name, options} = params
          doc.event.add(name, listener.bind(this), options)
        })
      }

      Reflect.deleteMetadata('hotKeyListeners', this)
      Reflect.deleteMetadata('eventListeners', this)
    }
  }
}

export function EventListen(name: EventNames, options?: EventOptions) {
  return function (origin: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    Reflect.defineMetadata("eventOptions", {name, options}, origin, propertyKey)
    const old = Reflect.getMetadata('eventListeners', origin) || []
    old.push(propertyKey)
    Reflect.defineMetadata('eventListeners', old, origin)

    return originalMethod
  }
}

export function BindHotKey(binding: HotKeyTrigger, options?: EventOptions) {
  return function (origin: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    Reflect.defineMetadata("hotKeyOptions", {binding, options}, origin, propertyKey)
    const old = Reflect.getMetadata('hotKeyListeners', origin) || []
    old.push(propertyKey)
    Reflect.defineMetadata('hotKeyListeners', old, origin)
    return originalMethod
  }
}
