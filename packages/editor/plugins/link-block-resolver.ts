import {InjectionToken} from '@angular/core';

/** A target is created by its registered Schema; resolvers never mutate the document. */
export interface LinkBlockTarget<F extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour> {
  kind: 'block';
  label: string;
  flavour: F;
  params: BlockCraft.BlockCreateParameters<F>;
}

export type LinkBlockResolution = LinkBlockTarget | {kind: 'blocked'} | {kind: 'unhandled'};

export interface LinkBlockResolveContext {
  readonly phase: 'menu' | 'convert';
  readonly signal: AbortSignal;
}

/** Host-owned link identity, resource metadata and access decisions. */
export interface LinkBlockResolver {
  /** Receives a normalized HTTP(S) URL; an error or blocked result never falls back to a webpage. */
  resolve(url: string, context: LinkBlockResolveContext): LinkBlockResolution | Promise<LinkBlockResolution>;
}

/** Optional document-scoped resolver shared by the inline link and bookmark plugins. */
export const LINK_BLOCK_RESOLVER = new InjectionToken<LinkBlockResolver>('BLOCKCRAFT_LINK_BLOCK_RESOLVER');
