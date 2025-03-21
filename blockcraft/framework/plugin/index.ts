import {DocEventRegister} from "../event";

@DocEventRegister
export class DocPlugin {
  name = 'custom'
  version = 1.0

  constructor(
    public readonly doc: BlockCraft.Doc
  ) {
    this.doc.afterInit(() => this.onInit())
  }

  onInit() {
  }

  destroy() {
  }
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
