import {InjectionToken} from "@angular/core";
import {IBlockSchemaOptions} from "../block-std/schema/block-schema";

/**
 * {@link DocFileService}
 */
export const BLOCK_CREATOR_SERVICE_TOKEN = new InjectionToken<BlockCreatorService>('block-creator');

export abstract class BlockCreatorService {

  abstract getParamsByScheme<T extends IBlockSchemaOptions>(flavour: T): Promise<BlockCraft.BlockCreateParameters<T['flavour']> | null>

}
