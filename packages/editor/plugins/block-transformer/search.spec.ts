import type {SlashMenuItem} from "./command";
import {
  createPinyinInitials,
  createSlashSearchIndex,
  matchesSlashSearch,
} from "./search";

describe("block transformer slash search", () => {
  function createItem(overrides: Partial<SlashMenuItem> = {}): SlashMenuItem {
    return {
      id: "block:callout",
      kind: "block",
      group: "basic",
      groupLabel: "基础内容",
      label: "高亮块",
      flavour: "callout",
      ...overrides,
    };
  }

  it("creates Chinese pinyin initials without a dictionary dependency", () => {
    expect(createPinyinInitials("高亮块")).toBe("glk");
    expect(createPinyinInitials("二级标题 H2")).toBe("ejbth2");
  });

  it("matches a Chinese block by a partial pinyin-initial query", () => {
    const searchIndex = createSlashSearchIndex(createItem());

    expect(matchesSlashSearch(searchIndex, "gl")).toBeTrue();
    expect(matchesSlashSearch(searchIndex, "高亮")).toBeTrue();
    expect(matchesSlashSearch(searchIndex, "call")).toBeTrue();
  });

  it("indexes host-provided command keywords as aliases and pinyin initials", () => {
    const searchIndex = createSlashSearchIndex(createItem({
      id: "host:approval",
      kind: "command",
      label: "审批入口",
      flavour: undefined,
      keywords: ["workflow", "快捷审批"],
    }));

    expect(matchesSlashSearch(searchIndex, "workflow")).toBeTrue();
    expect(matchesSlashSearch(searchIndex, "kjsp")).toBeTrue();
  });

  it("does not turn introduction text into an accidental pinyin alias", () => {
    const searchIndex = createSlashSearchIndex(createItem({
      id: "block:code",
      label: "代码块",
      flavour: "code",
      description: "插入支持语法高亮的代码",
      keywords: ["code"],
    }));

    expect(matchesSlashSearch(searchIndex, "gl")).toBeFalse();
  });
});
