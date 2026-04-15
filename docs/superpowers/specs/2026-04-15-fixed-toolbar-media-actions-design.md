# Fixed Toolbar Media Actions Design

Date: 2026-04-15
Status: proposed and user-approved in chat
Scope: `packages/editor/plugins/fixed-toolbar/`, `packages/editor/editor/services/block-creator.service.ts`, `packages/editor/components/media-creator/`

## Goal

Extend `FixedTextToolbarComponent` with richer insertion actions:

- keep table insertion and column insertion as single buttons, but give them a dropdown-style visual cue
- add an image insertion button that supports either image URL input or local image upload
- add a video/audio dropdown button whose menu opens the existing media creation flow for either video or audio

## Non-goals

- Do not redesign the fixed toolbar layout.
- Do not convert table/column actions into split buttons.
- Do not add a generic schema-driven insert menu for all block types.
- Do not change video/audio creation semantics beyond exposing them from fixed toolbar.

## Recommended Approach

Reuse the existing block-creator and media-creator infrastructure rather than duplicating insertion dialogs inside the fixed toolbar.

The fixed toolbar should only decide:

- which insertion action the user chose
- where to insert the resulting block snapshot

Parameter collection should remain delegated to the block creator service.

## Behavior Design

### Table and columns buttons

- `插入表格` and `创建分栏` remain single toolbar buttons.
- Each button gets a caret/down-arrow visual cue so users understand it opens a picker.
- Clicking still opens the existing `BcTableSizePickerComponent` or `BcColumnCountPickerComponent`.

### Image insertion

- Add a dedicated image button to the fixed toolbar.
- Clicking the button opens a media creation panel for `image` with two tabs:
  - link
  - local upload
- On success, insert an `image` snapshot after the resolved anchor block using the same insertion pattern as the existing table/columns helpers.

### Video/audio insertion

- Add one toolbar button with dropdown styling for media.
- Its overlay menu offers two actions:
  - insert video
  - insert audio
- Picking one opens the existing media creation panel for the chosen media type.
- On success, insert the matching block snapshot after the resolved anchor block.

## Implementation Notes

Primary implementation files:

- `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
- `packages/editor/editor/services/block-creator.service.ts`
- `packages/editor/components/media-creator/index.ts`

Expected code changes:

1. Add toolbar buttons and small overlay menu(s) in the fixed-toolbar template.
2. Add a reusable helper in fixed-toolbar to insert a block by flavour via `BLOCK_CREATOR_SERVICE_TOKEN`.
3. Extend `MediaCreatorComponent` to support `image` mode with link or local file.
4. Update `MyBlockCreatorService.getParamsByScheme()` so `image` uses the creator dialog instead of local-file-only selection.

## Risk Assessment

Medium.

- `fixed-toolbar` UI risk is low.
- `block-creator.service.ts` is shared by more than the fixed toolbar, so changing image creation behavior affects other insert entry points that rely on the same service.
- `media-creator` is shared by video/audio already, so image support must avoid regressions in existing media validation.

## Validation Plan

Manual verification:

1. Click table and column buttons and confirm the picker still opens, now with dropdown affordance in the button.
2. Insert an image from a URL.
3. Insert an image from a local file.
4. Insert a video from the dropdown via URL and local upload.
5. Insert an audio from the dropdown via URL and local upload.
6. Confirm insertion anchor behavior still matches the current fixed-toolbar table/column insertion behavior.

Docs follow-up:

- Update `packages/editor/ai-skills/blockcraft-plugins-formatting.md`
- Add a patch entry to `packages/editor/ai-skills/MIGRATIONS.md`
