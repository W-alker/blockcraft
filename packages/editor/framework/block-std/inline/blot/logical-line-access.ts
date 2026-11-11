import type {IBlot} from './blot'
import type {TextBlot} from './text-blot'
import type {EmbedBlot} from './embed-blot'
import type {ScrollBlot} from './scroll-blot'

/** @internal A source line includes hidden LF; display rows may contain several. */
export interface LogicalSourceLine {
  readonly children: readonly IBlot[]
  readonly leaves: readonly (TextBlot | EmbedBlot)[]
  readonly text: string
  readonly length: number
}

/** @internal Available only while the opt-in canonical line view is trusted. */
export interface LogicalLineAccess {
  sourceLines(): readonly LogicalSourceLine[]
  locate(line: LogicalSourceLine): {
    lineIndex: number
    modelOffset: number
    childStart: number
    leafStart: number
  } | undefined
  blotFromDom(node: Node): IBlot | undefined
  nextLeaf(leaf: TextBlot | EmbedBlot): TextBlot | EmbedBlot | undefined
  trustedPlainText(): string | undefined
}

const providers = new WeakMap<ScrollBlot, () => LogicalLineAccess | undefined>()

/** @internal No public barrel; callers must retain their ordinary fallback. */
export function getLogicalLineAccess(scroll: ScrollBlot): LogicalLineAccess | undefined {
  return providers.get(scroll)?.()
}

/** @internal Registered by the owning ScrollBlot, never by feature plugins. */
export function registerLogicalLineAccess(scroll: ScrollBlot, provider: () => LogicalLineAccess | undefined): void {
  providers.set(scroll, provider)
}
