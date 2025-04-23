import {registerClassEvents} from "../event";

export abstract class DocPlugin {
  name = 'custom'
  version = 1.0
  protected doc!: BlockCraft.Doc

  register(doc: BlockCraft.Doc) {
    this.doc = doc

    registerClassEvents.call(this, doc)

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
