import { registerClassEvents } from "../block-std";

import type {InteractionConfigDefinition} from '../doc/interaction-schema';

export abstract class DocPlugin {
  name = 'custom'
  version = 1.0
  /** Pure metadata, available before init; never read this.doc while declaring it. */
  readonly interactionConfigs: readonly InteractionConfigDefinition[] = []
  protected doc!: BlockCraft.Doc

  register(doc: BlockCraft.Doc) {
    doc.interaction?.registerPlugin(this)
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
