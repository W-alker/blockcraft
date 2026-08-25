/**
 * Compact runtime reference for the model. This is intentionally narrower
 * than the full editor skill: it contains the contracts an Agent may read or
 * propose through the host, without asking the model to reproduce framework
 * internals or DOM code.
 */
export const BLOCKCRAFT_AGENT_API_REFERENCE = `
BLOCKCRAFT API REFERENCE

The host uses BlockCraft's model-first API. The document is a Yjs-backed tree;
the model graph is the source of truth and DOM/component instances may be
virtualized or absent.

READ APIs (conceptual host APIs):
- blockcraft.get_editor_state returns rootId, readonly state, current
  anchor/head selection, selected text, structure revision and capabilities.
- blockcraft.get_block({blockId}) returns one model block's parent/index,
  child IDs, props, text deltas and snapshot without requiring a mounted view.
- doc.model.getPath(blockId)
- doc.model.getParentId(blockId)
- doc.model.getChildrenIds(blockId)
- doc.model.getTextLength(blockId)
- doc.model.getTextDeltas(blockId)
- doc.model.getProps(blockId)
- doc.model.getFlavour(blockId)
- doc.model.toSnapshot(blockId)
- doc.exportSnapshot()
- doc.schemas.has(flavour), doc.schemas.get(flavour, false)
- blockcraft.get_schema_capabilities returns the actual schemas registered by
  this host, including nodeType, label, child constraints and placement modes.
- doc.canInsertChild(parentId, childFlavour)

WRITE APIs (the host executes these only after validation and user confirmation):
- doc.crud.transact(() => { ... })
- doc.crud.replaceText(blockId, index, length, replacement)
- doc.crud.applyTextDelta(blockId, delta)
- doc.crud.updateBlockProps(blockId, props)
- doc.crud.insertBlockSnapshots(parentId, index, snapshots)
- doc.crud.replaceWithSnapshots(blockId, snapshots)
- doc.crud.deleteBlockById(blockId), deleteBlocks(parentId, index, count)
- doc.crud.moveBlocks(parentId, index, count, targetParentId, targetIndex)
- doc.schemas.createSnapshot(flavour, params)

AGENT OPERATION MAPPING:
- replace-text maps to doc.crud.replaceText; offsets are model text offsets.
- update-block-props maps to doc.crud.updateBlockProps; only existing props or
  host-allowlisted presentation props may be changed.
- create-blocks asks the host to call doc.schemas.createSnapshot(flavour, params)
  so the host, not the model, generates block IDs and normalized defaults.
- replace-block asks the host to create one Schema snapshot and atomically call
  doc.crud.replaceWithSnapshots on an existing block. Use this for representation
  changes such as bookmark/embed/card or inline transformations.
- insert-blocks is a compatibility path for trusted, already formed snapshots;
  prefer create-blocks for new content and never invent snapshot IDs.
- apply-text-delta maps to doc.crud.applyTextDelta and is the rich-text path
  for formatting or inline changes. Use model offsets and Delta operations;
  do not issue DOM selection or contenteditable commands.
- delete-blocks maps to doc.crud.deleteBlocks and removes a contiguous child
  range. move-blocks maps to doc.crud.moveBlocks and only moves existing
  contiguous children into a Schema-compatible parent.

BLOCK TAXONOMY:
- editable: paragraph, ordered, bullet, todo, blockquote, caption, code,
  mermaid-textarea, word-art. Text lives in model inline/Y.Text deltas.
- block/container: root, callout, columns, column, table, table-row, table-cell,
  frame, shape, text-box, mermaid, object-group, placement-layout, render-unit.
- void: divider, page-divider, image, attachment, bookmark, formula, video,
  audio and registered embed blocks.

DESIGN BLOCK CREATE CONTRACTS:
- shape: createSnapshot('shape', [shapeType, optionalText]); text is a
  shape-text child. Important props include shapeType, width, height, rotation,
  fillColor, fillType, gradientAngle, gradientColors, gradientStops,
  fillOpacity, strokeColor, strokeWidth, strokeStyle, textColor,
  shapeTextAlign, verticalAlign, adjustments and customGeometry.
- text-box: createSnapshot('text-box', [textOrDeltas, props]); it contains a
  paragraph child. Important props include width, height, rotation, position,
  backColor, borderColor, p, sh, fo, bw, bs, wm and optional wa.
- word-art: createSnapshot('word-art', [textOrDeltas, props]); it is editable
  plain text. Important props include width, height, rotation, fontFamily,
  fontSize, fontWeight, fontStyle, letterSpacingEm, lineHeight,
  horizontalAlign, verticalAlign, fillType, fillColor, gradientAngle,
  gradientColors, gradientStops, outlineColor, outlineWidthEm,
  shadowEnabled, shadowColor, shadowOpacity, shadowOffsetXEm,
  shadowOffsetYEm, shadowBlurEm and effect.
- mermaid: createSnapshot('mermaid', [mode, source]); mode is 'text', 'graph',
  or 'default', and source is the plain Mermaid DSL string. The Schema creates
  the internal 'mermaid-textarea' child; never insert that child directly under
  the document root.
- Existing Mermaid view mode changes use update-block-props on the Mermaid
  block with {mode: 'graph'} for preview-only, {mode: 'text'} for source-only,
  and {mode: 'default'} for source plus preview. Never set data-mode or
  manipulate the rendered DOM.
- paragraph headings are props.heading; do not invent a heading flavour.

LAYOUT RULES:
- Absolute design objects use their block placement/position props and must be
  inserted under a parent that accepts the requested flavour.
- Use stable IDs from context for edits. For new blocks use create-blocks;
  never manually concatenate IDs or return DOM/CSS/HTML instructions.
- Use the schema's normalized defaults. Do not omit required creation params
  when a block's createSnapshot contract requires them.

SAFETY RULES:
- The request context is authoritative. Never invent a blockId, text offset,
  schema, parent or prop key.
- Do not write Yjs maps, DOM nodes, Angular components or framework internals.
- The host validates readonly state, structure/content revision, schema
  compatibility and writable props before one Yjs transaction.
- Return a concise summary and structured operations only; do not claim a
  change was applied before the host confirms it.
`
