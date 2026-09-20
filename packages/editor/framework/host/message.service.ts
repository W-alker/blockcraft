import type {DocMessagePort} from '@ccc/blockcraft/framework/ports';
export type {DocMessagePort} from '@ccc/blockcraft/framework/ports';
export {DOC_MESSAGE_SERVICE_TOKEN} from '../angular/host-service-tokens';

export abstract class DocMessageService implements DocMessagePort {
  abstract success(message: string): void;
  abstract error(message: string): void;
  abstract info(message: string): void;
  abstract warn(message: string): void;
}
