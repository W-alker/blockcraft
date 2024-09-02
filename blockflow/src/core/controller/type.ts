export interface IRange {
  start: number
  end: number
}

export type IBlockFlowRange = { rootRange?: IRange, isAtRoot: true, rootId: string }
  | { blockRange: IRange, blockId: string, isAtRoot: false }
