import type * as Y from 'yjs'
import type {IBlockSnapshot} from '../../block-std/types'

/** Stable content identity is independent from the current shared container ID. */
export interface DocumentContentRegion {
  readonly id: string
  readonly blockId: string
}

export interface DocumentPersonalData {
  readonly formatVersion: 1
  readonly regions: Readonly<Record<string, {readonly children: readonly IBlockSnapshot[]}>>
}

export interface DocumentCompositionOptions {
  readonly sharedDoc: Y.Doc
  readonly rootId: string
  readonly regions: readonly DocumentContentRegion[]
  readonly personalData?: DocumentPersonalData
}

export interface DocumentPersonalChange {
  readonly regionIds: readonly string[]
}

/** null = shared; string = independent region; undefined = unknown block. */
export type DocumentContentScope = string | null | undefined

export class DocumentCompositionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentCompositionError'
  }
}
