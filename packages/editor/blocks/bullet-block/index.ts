import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/block-std/types";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/block-std/schema/block-schema";
import {BulletBlockComponent} from "./bullet.block";

export interface BulletBlockModel extends EditableBlockNative {
  flavour: 'bullet'
}

export const BulletBlockSchema: IBlockSchemaOptions<BulletBlockModel> = {
  flavour: 'bullet',
  nodeType: BlockNodeType.editable,
  component: BulletBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<BulletBlockModel>('bullet'),
  metadata: {
    version: 1,
    label: "无序列表",
    icon: 'bc_icon bc_wuxuliebiao-color',
    svgIcon: 'bc_wuxuliebiao-color'
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'bullet': BulletBlockComponent
    }

    interface IBlockCreateParameters {
      'bullet': EditableBlockCreateSnapshotParams
    }
  }
}
