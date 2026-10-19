// 旧入口保留完整默认能力；内部代码直接依赖 clipboard-manager。
export {ClipboardManager} from '../../../editor/clipboard-manager'
export * from './types'
export * from './copy-filter'
export type {ClipboardSourceAdapter, ClipboardSourceData} from './source-adapter'
