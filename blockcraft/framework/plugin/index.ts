export abstract class DocPlugin {
  name = 'custom'
  version = 1.0
  protected doc!: BlockCraft.Doc

  register(doc: BlockCraft.Doc) {
    this.doc = doc

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

    this.init()
  }

  abstract init(): void

  abstract destroy(): void
}

declare global {
  namespace BlockCraft {
    interface IPlugins {
      [key: string]: DocPlugin
    }

    type PluginName = keyof IPlugins

    type Plugin = DocPlugin
  }
}
