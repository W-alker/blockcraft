import type {SlashMenuItem} from "./command";

const PINYIN_BOUNDARIES = [
  ["a", "阿"],
  ["b", "八"],
  ["c", "擦"],
  ["d", "搭"],
  ["e", "蛾"],
  ["f", "发"],
  ["g", "旮"],
  ["h", "哈"],
  ["j", "击"],
  ["k", "喀"],
  ["l", "拉"],
  ["m", "妈"],
  ["n", "拿"],
  ["o", "哦"],
  ["p", "趴"],
  ["q", "七"],
  ["r", "然"],
  ["s", "撒"],
  ["t", "他"],
  ["w", "挖"],
  ["x", "夕"],
  ["y", "压"],
  ["z", "匝"],
] as const;

const pinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", {
  usage: "sort",
  sensitivity: "base",
});

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function isHanCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

/**
 * Returns a compact search key made from the pinyin initials of Han
 * characters while preserving existing ASCII letters and numbers.
 */
export function createPinyinInitials(value: string) {
  let initials = "";
  for (const character of normalizeSearchText(value)) {
    if (/[a-z0-9]/.test(character)) {
      initials += character;
      continue;
    }
    if (!isHanCharacter(character)) continue;
    for (let index = PINYIN_BOUNDARIES.length - 1; index >= 0; index--) {
      const [initial, boundary] = PINYIN_BOUNDARIES[index];
      if (pinyinCollator.compare(character, boundary) >= 0) {
        initials += initial;
        break;
      }
    }
  }
  return initials;
}

export function createSlashSearchIndex(item: SlashMenuItem) {
  const searchableTerms = [
    item.label,
    item.id,
    item.flavour,
    item.searchHint?.replace(/^\/+/, ""),
    ...(item.keywords ?? []),
  ].filter((term): term is string => !!term);
  const index = new Set<string>();
  for (const term of searchableTerms) {
    const normalized = normalizeSearchText(term);
    if (normalized) index.add(normalized);
  }
  for (const term of [item.label, ...(item.keywords ?? [])]) {
    const normalized = normalizeSearchText(term);
    const initials = createPinyinInitials(normalized);
    if (initials) index.add(initials);
  }
  return [...index];
}

export function matchesSlashSearch(
  searchIndex: readonly string[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  return searchIndex.some(term => term.includes(normalizedQuery));
}
