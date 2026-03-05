import { Injector } from "@angular/core"
import * as Y from "yjs"
import { Logger } from "../../global"
import { EmbedConverter, IBlockSnapshot, YBlock } from "../block-std"
import { BlockCraftDoc } from "../doc"
import { DocPlugin } from "../plugin"

interface DocBuilderConfig {
  docId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  yDoc: Y.Doc
  theme?: string
  embeds?: [string, EmbedConverter][]
  plugins?: DocPlugin[]
  readonly?: boolean
  scrollContainer?: HTMLElement
}

export class BlockCraftDocBuilder {

  private readonly config: Partial<DocBuilderConfig> = {
    embeds: [],
    plugins: []
  }

  static create() {
    return new BlockCraftDocBuilder()
  }

  clone() {
    const cloned = new BlockCraftDocBuilder()
    cloned.config.docId = this.config.docId
    cloned.config.schemas = this.config.schemas
    cloned.config.logger = this.config.logger
    cloned.config.injector = this.config.injector
    cloned.config.yDoc = this.config.yDoc
    cloned.config.theme = this.config.theme
    cloned.config.readonly = this.config.readonly
    cloned.config.scrollContainer = this.config.scrollContainer
    cloned.config.embeds = this.config.embeds ? [...this.config.embeds] : []
    cloned.config.plugins = this.config.plugins ? [...this.config.plugins] : []
    return cloned
  }

  docId(docId: string) {
    this.config.docId = docId
    return this
  }

  schemas(schemas: BlockCraft.SchemaManager) {
    this.config.schemas = schemas
    return this
  }

  logger(logger: Logger) {
    this.config.logger = logger
    return this
  }

  injector(injector: Injector) {
    this.config.injector = injector
    return this
  }

  yDoc(yDoc: Y.Doc) {
    this.config.yDoc = yDoc
    return this
  }

  theme(theme: string) {
    this.config.theme = theme
    return this
  }

  setReadonly(readonly = true) {
    this.config.readonly = readonly
    return this
  }

  scrollContainer(container: HTMLElement) {
    this.config.scrollContainer = container
    return this
  }

  usePlugin(plugin: DocPlugin) {
    ;(this.config.plugins ??= []).push(plugin)
    return this
  }

  usePlugins(plugins: DocPlugin[]) {
    ;(this.config.plugins ??= []).push(...plugins)
    return this
  }

  clearPlugins() {
    this.config.plugins = []
    return this
  }

  useEmbed(name: string, converter: EmbedConverter) {
    ;(this.config.embeds ??= []).push([name, converter])
    return this
  }

  useEmbeds(embeds: [string, EmbedConverter][]) {
    ;(this.config.embeds ??= []).push(...embeds)
    return this
  }

  clearEmbeds() {
    this.config.embeds = []
    return this
  }

  build() {
    const docId = this.assertRequired('docId')
    const schemas = this.assertRequired('schemas')
    const logger = this.assertRequired('logger')
    const injector = this.assertRequired('injector')
    const yDoc = this.assertRequired('yDoc')

    return new BlockCraftDoc({
      docId,
      schemas,
      logger,
      injector,
      yDoc,
      theme: this.config.theme,
      readonly: this.config.readonly,
      scrollContainer: this.config.scrollContainer,
      embeds: this.config.embeds ? [...this.config.embeds] : [],
      plugins: this.config.plugins ? [...this.config.plugins] : []
    })
  }

  mountBySnapshot(snapshot: IBlockSnapshot, container: HTMLElement) {
    const doc = this.build()
    doc.initBySnapshot(snapshot, container)
    return doc
  }

  mountByYBlock(yRoot: YBlock, container: HTMLElement) {
    const doc = this.build()
    doc.initByYBlock(yRoot, container)
    return doc
  }

  private assertRequired<K extends keyof DocBuilderConfig>(key: K): DocBuilderConfig[K] {
    const value = this.config[key]
    if (value === null || value === undefined) {
      throw new Error(`BlockCraftDocBuilder: "${String(key)}" is required`)
    }
    return value as DocBuilderConfig[K]
  }
}

export const createDocBuilder = () => BlockCraftDocBuilder.create()
