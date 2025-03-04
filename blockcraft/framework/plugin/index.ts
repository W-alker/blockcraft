export abstract class DocPlugin {
  name = 'custom'
  version = 1.0

  doc!: BlockCraft.Doc

  loadDoc(doc: BlockCraft.Doc) {
    this.doc = doc
      this.onInit()
  }

  abstract onInit(): void

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
