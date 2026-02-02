
// 类型定义将从 shiki-config.ts 中的 SHIKI_LANGUAGE_MAP 生成
import {SHIKI_LANGUAGE_MAP} from "./shiki-config";

export type CodeBlockLanguage = string

export const LANGUAGE_LIST = Object.keys(SHIKI_LANGUAGE_MAP) as CodeBlockLanguage[]
