import {formatHotKeyHint, resolveSlashSearchAlias} from "./presentation";

describe("block transformer menu presentation", () => {
  it("formats cross-platform shortcuts independently from descriptions", () => {
    const hotkey = {
      key: ["q", "Q"],
      shortKey: true,
      shiftKey: true,
    };

    expect(formatHotKeyHint(hotkey, true)).toBe("⌘⇧Q");
    expect(formatHotKeyHint(hotkey, false)).toBe("Ctrl+Shift+Q");
  });

  it("uses an explicit quick-search alias before the generated pinyin key", () => {
    expect(resolveSlashSearchAlias("高亮块", "/gl")).toBe("gl");
    expect(resolveSlashSearchAlias("高亮块")).toBe("glk");
  });
});
