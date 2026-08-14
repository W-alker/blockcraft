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

  it("projects compact typography attributes through the shared safe catalog", () => {
    const fragment = renderInline([{
      insert: "Typography",
      attributes: {
        "t:ff": "kai",
        "t:fs": 1.25,
        "t:ls": 0.08,
      },
    }])

    const element = fragment.querySelector<HTMLElement>("c-element")!
    expect(element.dataset["bcFf"]).toBe("kai")
    expect(element.dataset["bcFs"]).toBe("1.25")
    expect(element.dataset["bcLs"]).toBe("0.08")
    expect(element.style.fontFamily).toContain("Kaiti SC")
    expect(element.style.fontSize).toBe("1.25em")
    expect(element.style.letterSpacing).toBe("0.08em")
  })

  it("keeps legacy camelCase s: typography styles render-compatible", () => {
    const fragment = renderInline([{
      insert: "Legacy",
      attributes: {
        "s:fontFamily": "serif",
        "s:fontSize": "1.2em",
        "s:letterSpacing": "0.05em",
      },
    }])

    const element = fragment.querySelector<HTMLElement>("c-element")!
    expect(element.style.getPropertyValue("font-family")).toBe("serif")
    expect(element.style.getPropertyValue("font-size")).toBe("1.2em")
    expect(element.style.getPropertyValue("letter-spacing")).toBe("0.05em")
  })

  it("rejects invalid compact typography instead of exposing it as raw attributes", () => {
    const fragment = renderInline([{
      insert: "Unsafe",
      attributes: {
        "t:ff": "url(javascript:bad)" as any,
        "t:fs": 99,
        "t:ls": 4,
      },
    }])

    const element = fragment.querySelector<HTMLElement>("c-element")!
    expect(element.hasAttribute("t:ff")).toBeFalse()
    expect(element.hasAttribute("t:fs")).toBeFalse()
    expect(element.style.fontFamily).toBe("")
    expect(element.style.fontSize).toBe("")
    expect(element.style.letterSpacing).toBe("")
  })
})
