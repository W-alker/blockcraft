import {renderInline} from "./render-inline";

describe("renderInline", () => {
  it("renders bold and link attributes into readonly inline elements", () => {
    const fragment = renderInline([
      {insert: "Hello", attributes: {"a:bold": true}},
      {insert: " world", attributes: {"a:link": "https://example.com"}},
    ])

    expect(fragment.textContent).toBe("Hello world")
    expect(fragment.querySelector('[bold="true"]')).not.toBeNull()

    const anchor = fragment.querySelector("a")
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute("href")).toBe("https://example.com")
  })

  it("keeps inline embed wrapper as readonly content", () => {
    const fragment = renderInline([
      {
        insert: {mention: "Alice"},
        attributes: {
          mentionId: "user-1",
          mentionType: "user",
        },
      },
    ])

    const wrapper = fragment.querySelector('span[contenteditable="false"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.textContent).toContain("Alice")
  })

  it("renders mention embeds with real mention attributes on the inner span", () => {
    const fragment = renderInline([
      {
        insert: {mention: "Alice"},
        attributes: {
          mentionId: "user-1",
          mentionType: "user",
        },
      },
    ])

    const mention = fragment.querySelector('span[data-mention-id="user-1"][data-mention-type="user"]')
    expect(mention).not.toBeNull()
    expect(mention?.textContent).toBe("Alice")
  })

  it("renders inline latex embeds with formula markup", () => {
    const fragment = renderInline([
      {
        insert: {latex: "E=mc^2"},
      },
    ])

    const formula = fragment.querySelector(".inline-formula")
    expect(formula).not.toBeNull()
    expect(formula?.getAttribute("data-latex")).toBe("E=mc^2")
  })
})
