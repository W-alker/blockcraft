// Yjs transaction origin markers.
//
// 这两个常量被「最底层基类」(base-block / reactive) 与「较重的 doc 层」(crud) 同时引用。
// 单独放在这个零依赖叶子文件里，避免 base-block / reactive 为了拿它们而 import 整个
// `../doc` barrel —— 后者会把 modules / chain / 各 block 子类拖进 base-block 的依赖闭包，
// 导致 rollup 打包时把 BaseBlockComponent 排到子类之后，引发
// "The superclass is not a constructor"(WKWebView) / TDZ(V8) 启动崩溃。

// This origin will skip Y.Event sync (to model)
export const ORIGIN_SKIP_SYNC = Symbol('skip_sync')
// This origin will not be recorded in undo/redo stack
export const ORIGIN_NO_RECORD = Symbol('no_record')
