/* 纯文本索引的焦点选区范围 */
export interface ICharacterRange {
  start: number,
  end: number,
}

export type CharacterIndex = number | 'start' | 'end'

export type IBlockFlowRange = { rootRange?: ICharacterRange, isAtRoot: true, rootId: string }
  | { blockRange: ICharacterRange, blockId: string, isAtRoot: false }
