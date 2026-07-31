import {
  BlockNodeType,
  type IBlockSchemaOptions,
  type IBlockSnapshot,
  type NoEditableBlockNative,
} from '../../framework'
import {generateId} from '../../framework'
import {BLOCK_PLACEMENT_LAYOUT_FLAVOUR} from '../../framework/services/block-placement.manager'
import {PlacementLayoutBlockComponent} from './placement-layout.block'

export {PlacementLayoutBlockComponent} from './placement-layout.block'

export interface PlacementLayoutBlockModel extends NoEditableBlockNative {
  flavour: typeof BLOCK_PLACEMENT_LAYOUT_FLAVOUR
  nodeType: BlockNodeType.block
  props: {}
}

export const PlacementLayoutBlockSchema:
IBlockSchemaOptions<PlacementLayoutBlockModel> = {
  flavour: BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
  nodeType: BlockNodeType.block,
  component: PlacementLayoutBlockComponent,
  createSnapshot: (children: IBlockSnapshot[] = []) => ({
    id: generateId(),
    flavour: BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
    nodeType: BlockNodeType.block,
    props: {},
    meta: {},
    children,
  }),
  metadata: {
    version: 1,
    label: '',
    renderUnit: true,
    hideInInsertMenu: true,
    // Future positionable flavours share this infrastructure block. The
    // placement normalizer is the capability gate and moves flow-only or
    // relative children back to root.
    includeChildren: ['*'],
    excludeChildren: ['root', BLOCK_PLACEMENT_LAYOUT_FLAVOUR],
    selectionScope: 'transparent',
    // Root virtualization mounts this render unit from its children's
    // persisted placement geometry. Keeping it alive after first paint would
    // defeat offscreen absolute-object virtualization.
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'placement-layout': PlacementLayoutBlockComponent
    }

    interface IBlockCreateParameters {
      'placement-layout': [IBlockSnapshot[]?]
    }
  }
}
