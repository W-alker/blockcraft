export type {
  SimpleBasicType, SimpleValue, SimpleRecord, SimpleArray, SimpleObject,
  UnknownRecord, UnknownArray,
} from '@ccc/blockcraft/global/types'
export {BlockCraftError, ErrorCode, handleError} from '@ccc/blockcraft/global/exceptions'
export {ConsoleLogger, NoopLogger} from '@ccc/blockcraft/global/logger'
export type {Logger} from '@ccc/blockcraft/global/logger'
export {
  IS_WEB, IS_SAFARI, IS_FIREFOX, IS_ANDROID, IS_IOS, IS_MAC,
  IS_IPAD, IS_WINDOWS, IS_MOBILE, IS_ELECTRON,
} from '@ccc/blockcraft/global/env'
export * from '@ccc/blockcraft/global/utils'
export {performanceTest} from '@ccc/blockcraft/global/decorators'
export {
  ResourcePlaceholderController, destroyResourcePlaceholder,
  imageResourcePlaceholderAdapter, videoResourcePlaceholderAdapter,
  iframeResourcePlaceholderAdapter,
} from '@ccc/blockcraft/global/resource-placeholder'
export type {
  ResourcePlaceholderState, ResourceIntrinsicSize, ResourcePlaceholderElement,
  ResourcePlaceholderAdapter, ResourcePlaceholderBinding,
  ResourcePlaceholderControllerOptions,
} from '@ccc/blockcraft/global/resource-placeholder'
