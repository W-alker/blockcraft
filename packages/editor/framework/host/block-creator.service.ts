import type {IBlockSchemaOptions} from "../block-std/schema/block-schema";
export {BLOCK_CREATOR_SERVICE_TOKEN} from '../angular/host-service-tokens';

export abstract class BlockCreatorService {

  abstract getParamsByScheme<T extends IBlockSchemaOptions>(flavour: T): Promise<BlockCraft.BlockCreateParameters<T['flavour']> | null>

}
