/**
 * Optional rendering port used when a live model selection cannot yet be
 * projected because one of its endpoint components is not mounted.
 */
export interface SelectionProjectionMountAdapter {
  ensureMounted(
    blockIds: readonly string[],
    signal: AbortSignal,
  ): void | Promise<void>
}
