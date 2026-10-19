import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {DocumentAgentManifestOptions} from '../core/host-extension'

/** Resolve capability visibility from the Doc's normalized runtime registries. */
export function captureDocumentAgentManifestOptions(
  doc: BlockCraftDoc,
): DocumentAgentManifestOptions {
  return {
    registeredBlockFlavours: doc.schemas.getSchemaList()
      .map(schema => String(schema.flavour)),
    registeredInlineEmbedKeys: (doc.config.embeds ?? [])
      .map(([embedKey]) => embedKey),
  }
}
