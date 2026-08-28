import {createSnapshotRenderer} from "./index";
import {BlockNodeType, IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";
import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from "../framework";
import {createAllBlocksFixture} from "./testing/fixtures/all-blocks.fixture";

describe("SnapshotRenderEngine", () => {
  it("renders a root snapshot into a host container", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const snapshot = createAllBlocksFixture().minimalParagraphDoc

    renderer.render(host, snapshot)

    expect(host.querySelector('[data-block-id="paragraph-1"]')).not.toBeNull()
    expect(host.textContent).toContain("hello snapshot viewer")
  })

  it("patches a paragraph in place when only text changes and id stays stable", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const first = wrapRoot([createParagraphFixture("paragraph-1", "before")])
    const second = wrapRoot([createParagraphFixture("paragraph-1", "after")])

    renderer.render(host, first)
    const oldNode = host.querySelector('[data-block-id="paragraph-1"]')
    renderer.update(second)
    const newNode = host.querySelector('[data-block-id="paragraph-1"]')

    expect(newNode).toBe(oldNode)
    expect(host.textContent).toContain("after")
  })

  it("uses the bundled inline converter through the Snapshot Viewer", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const first = createParagraphWithInlineFixture("inline-paragraph", [{
      insert: {date: "2026-08-14T15:54"},
      attributes: {format: "YYYY-MM-DD"},
    }])
    const second = createParagraphWithInlineFixture("inline-paragraph", [{
      insert: {date: "2026-08-15T15:54"},
      attributes: {format: "YYYY-MM-DD"},
    }])

    renderer.render(host, wrapRoot([first]))
    expect(host.querySelector(".bc-inline-date .bc-inline-date__value")?.textContent)
      .toBe("2026-08-14")
    expect(host.querySelector(".bc-snapshot-inline-embed")).toBeNull()

    renderer.update(wrapRoot([second]))
    expect(host.querySelector(".bc-inline-date .bc-inline-date__value")?.textContent)
      .toBe("2026-08-15")
    expect(host.querySelector(".bc-snapshot-inline-embed")).toBeNull()
    renderer.destroy()
  })

  it("projects, updates, and clears common block appearance props", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const first = createParagraphFixture("paragraph-1", "styled")
    first.props = {
      ...first.props,
      backColor: "#FBF3DB",
      borderColor: "#E9E9E7",
    }

    renderer.render(host, wrapRoot([first]))
    const block = host.querySelector<HTMLElement>('[data-block-id="paragraph-1"]')!
    expect(block.hasAttribute("data-bc-block-background")).toBeTrue()
    expect(block.hasAttribute("data-bc-block-border")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-block-background-color"))
      .toBe("#FBF3DB")
    expect(block.style.getPropertyValue("--bc-block-border-color"))
      .toBe("#E9E9E7")

    const cleared = createParagraphFixture("paragraph-1", "styled")
    cleared.props = {...cleared.props, backColor: null, borderColor: "transparent"}
    renderer.update(wrapRoot([cleared]))

    expect(host.querySelector('[data-block-id="paragraph-1"]')).toBe(block)
    expect(block.hasAttribute("data-bc-block-background")).toBeFalse()
    expect(block.hasAttribute("data-bc-block-border")).toBeFalse()
    expect(block.style.getPropertyValue("--bc-block-background-color")).toBe("")
    expect(block.style.getPropertyValue("--bc-block-border-color")).toBe("")
  })

  it("ignores persisted appearance colors on non-editable snapshot blocks", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const divider: IBlockSnapshot = {
      id: "divider-1",
      flavour: "divider",
      nodeType: BlockNodeType.void,
      meta: {},
      props: {backColor: "#FBF3DB", borderColor: "#E9E9E7"},
      children: [],
    }

    renderer.render(host, wrapRoot([divider]))
    const block = host.querySelector<HTMLElement>('[data-block-id="divider-1"]')!
    expect(block.hasAttribute("data-bc-block-background")).toBeFalse()
    expect(block.hasAttribute("data-bc-block-border")).toBeFalse()
    expect(block.style.getPropertyValue("--bc-block-background-color")).toBe("")
    expect(block.style.getPropertyValue("--bc-block-border-color")).toBe("")
  })

  it("projects and updates render-unit appearance without using the editable-block contract", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const region = createRenderUnitFixture("region-1", {
      backColor: "#FBF3DB",
      borderColor: "#DFAB01",
    })

    renderer.render(host, wrapRoot([region]))
    const block = host.querySelector<HTMLElement>('[data-block-id="region-1"]')!
    expect(block.getAttribute("data-bc-render-unit")).toBe("true")
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#FBF3DB")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("#DFAB01")

    renderer.update(wrapRoot([
      createRenderUnitFixture("region-1", {
        backColor: "#DDEDEA",
        borderColor: "transparent",
      }),
    ]))

    expect(host.querySelector('[data-block-id="region-1"]')).toBe(block)
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#DDEDEA")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("")
  })

  it("projects and clears render-unit padding and background images in place", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({
      baseUrl: "https://docs.example.com/manual/",
    })
    const region = createRenderUnitFixture("region-surface", {
      p: [8, 12, 16, 20],
      bgi: "images/paper.png",
      bgs: "stretch",
      bgx: 25,
      bgy: 75,
      bgo: 0.45,
    })

    renderer.render(host, wrapRoot([region]))
    const block = host.querySelector<HTMLElement>(
      '[data-block-id="region-surface"]',
    )!
    const paragraph = host.querySelector<HTMLElement>(
      '[data-block-id="region-surface-paragraph"]',
    )!
    const image = block.querySelector<HTMLImageElement>(
      ".render-unit-background-image",
    )!

    expect(block.style.getPropertyValue("--bc-render-unit-padding-top"))
      .toBe("8px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-right"))
      .toBe("12px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-bottom"))
      .toBe("16px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-left"))
      .toBe("20px")
    expect(image.src).toBe("https://docs.example.com/manual/images/paper.png")
    expect(image.style.objectFit).toBe("fill")
    expect(image.style.objectPosition).toBe("25% 75%")
    expect(image.style.opacity).toBe("0.45")

    renderer.update(wrapRoot([
      createRenderUnitFixture("region-surface", {}),
    ]))

    expect(host.querySelector('[data-block-id="region-surface"]')).toBe(block)
    expect(host.querySelector('[data-block-id="region-surface-paragraph"]'))
      .toBe(paragraph)
    expect(block.querySelector(".render-unit-background-image")).toBeNull()
    expect(block.style.getPropertyValue("--bc-render-unit-padding-top"))
      .toBe("0px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-left"))
      .toBe("0px")
  })

  it("does not fetch render-unit background images when resources are off", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({resourcePolicy: "off"})

    renderer.render(host, wrapRoot([
      createRenderUnitFixture("region-off", {
        bgi: "https://cdn.example.com/paper.png",
      }),
    ]))

    expect(host.querySelector(".render-unit-background-image")).toBeNull()
  })

  it("patches fixed text-box geometry and surface without remounting children", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({
      baseUrl: "https://docs.example.com/manual/",
    })
    const textBox = createTextBoxFixture("text-box-1", {
      width: 320,
      height: 160,
      rotation: 15,
      shape: "rounded-speech-bubble",
      fill: storeObjectPaint({
        type: "picture",
        src: "images/paper.png", fit: "stretch", positionX: 25,
        positionY: 75, opacity: .45,
      }),
      outline: storeObjectLine({
        ...DEFAULT_OBJECT_LINE, color: "#dfab01", width: 2, dash: "dash",
      }),
      effects: storeObjectEffects(DEFAULT_OBJECT_EFFECTS),
      textFrame: storeObjectTextFrame({
        ...DEFAULT_OBJECT_TEXT_FRAME, margins: [8, 12, 16, 20],
      }),
      textStyle: storeObjectTextStyle({
        ...DEFAULT_OBJECT_TEXT_STYLE,
        fill: {...DEFAULT_OBJECT_PAINT, color: "#2563EB"},
        outline: {type: "line", color: "#FFFFFF", width: 1},
        effects: {...DEFAULT_OBJECT_EFFECTS, shadow: {
          ...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true,
        }},
      }),
      position: {
        x: 40,
        y: 60,
      },
      placementLayer: "under",
    })

    renderer.render(host, wrapRoot([wrapPlacement([textBox])]))
    const block = host.querySelector<HTMLElement>(
      '[data-block-id="text-box-1"]',
    )!
    let surface = block.querySelector<HTMLElement>(
      ".text-box-block__surface",
    )!
    const paragraph = block.querySelector<HTMLElement>(
      '[data-block-id="text-box-1-paragraph"]',
    )!
    const image = block.querySelector<HTMLImageElement>(
      ".text-box-block__background-image",
    )!

    expect(block.getAttribute("data-bc-text-box")).toBe("true")
    expect(surface.style.width).toBe("320px")
    expect(surface.style.height).toBe("160px")
    expect(surface.style.transform).toBe("rotate(15deg)")
    expect(block.querySelectorAll("[data-bc-print-visual-surface]").length)
      .toBe(1)
    expect(surface.querySelector(".text-box-block__geometry--fill path"))
      .not.toBeNull()
    expect(surface.querySelector("clipPath path")).not.toBeNull()
    expect(surface.querySelector(".text-box-block__geometry--outline path"))
      .not.toBeNull()
    expect(surface.querySelector(".text-box-block__content")
      ?.classList.contains("text-box-block__content--word-art")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-text-box-word-art-color"))
      .toBe("rgba(37, 99, 235, 1)")
    expect(block.style.left).toBe("40px")
    expect(block.style.top).toBe("60px")
    expect(block.dataset["bcPlacementLayer"]).toBe("under")
    expect(block.style.getPropertyValue("--bc-text-box-padding-left"))
      .toBe("20px")
    expect(image.src).toBe("https://docs.example.com/manual/images/paper.png")
    expect(image.style.objectFit).toBe("fill")
    expect(image.style.objectPosition).toBe("25% 75%")
    expect(image.style.opacity).toBe("0.45")

    renderer.update(wrapRoot([wrapPlacement([
      createTextBoxFixture("text-box-1", {
        width: 240,
        height: 120,
        rotation: 0,
        textFrame: storeObjectTextFrame({
          ...DEFAULT_OBJECT_TEXT_FRAME, margins: [0, 0, 0, 0],
        }),
        position: {x: 40, y: 60},
      }),
    ])]))

    expect(host.querySelector('[data-block-id="text-box-1"]')).toBe(block)
    expect(host.querySelector('[data-block-id="text-box-1-paragraph"]'))
      .toBe(paragraph)
    expect(block.querySelector(".text-box-block__background-image")).toBeNull()
    surface = block.querySelector<HTMLElement>(".text-box-block__surface")!
    expect(surface.style.width).toBe("240px")
    expect(surface.style.height).toBe("120px")
    expect(surface.style.transform).toBe("")
    expect(block.style.getPropertyValue("--bc-text-box-padding-left"))
      .toBe("0px")
  })

  it("does not fetch text-box background images when resources are off", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({resourcePolicy: "off"})

    renderer.render(host, wrapRoot([
      createTextBoxFixture("text-box-off", {
        width: 240,
        height: 120,
        bgi: "https://cdn.example.com/paper.png",
      }),
    ]))

    expect(host.querySelector(".text-box-block__background-image")).toBeNull()
  })

  it("projects ordinary text-box typography and solid text color", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const textBox = createTextBoxFixture("text-box-typography", {
      textFrame: storeObjectTextFrame({
        ...DEFAULT_OBJECT_TEXT_FRAME,
        horizontalAlign: "right",
        verticalAlign: "bottom",
      }),
      textStyle: storeObjectTextStyle({
        ...DEFAULT_OBJECT_TEXT_STYLE,
        fontFamily: "Georgia, serif",
        fontSize: 29,
        fontWeight: 800,
        fontStyle: "italic",
        letterSpacingEm: 0.08,
        lineHeight: 1.4,
        fill: {...DEFAULT_OBJECT_PAINT, color: "#19324A", opacity: 0.8},
      }),
    })

    renderer.render(host, wrapRoot([textBox]))

    const content = host.querySelector<HTMLElement>(
      ".text-box-block__content",
    )!
    expect(content.classList).not.toContain(
      "text-box-block__content--word-art",
    )
    expect(content.style.fontFamily).toBe("Georgia, serif")
    expect(content.style.fontSize).toBe("29px")
    expect(content.style.fontWeight).toBe("800")
    expect(content.style.fontStyle).toBe("italic")
    expect(content.style.letterSpacing).toBe("0.08em")
    expect(content.style.lineHeight).toBe("1.4")
    expect(content.style.textAlign).toBe("right")
    expect(content.style.justifyContent).toBe("flex-end")
    expect(content.style.color).toBe("rgba(25, 50, 74, 0.8)")
  })

  it("projects compact document and editable-block typography", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const paragraph = createParagraphFixture("paragraph-typography", "styled")
    paragraph.props = {...paragraph.props, lh: 1.8}
    const snapshot = wrapRoot([paragraph])
    snapshot.props = {ff: "kai", fs: 18, lh: 1.6}

    renderer.render(host, snapshot)

    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    expect(root.dataset["bcFf"]).toBe("kai")
    expect(root.dataset["bcFs"]).toBe("18")
    expect(root.dataset["bcLh"]).toBe("1.6")
    expect(root.style.fontFamily).toContain("Kaiti SC")
    expect(root.style.getPropertyValue("--bc-fs")).toBe("18px")
    expect(root.style.getPropertyValue("--bc-lh")).toBe("1.6")

    const block = host.querySelector<HTMLElement>(
      '[data-block-id="paragraph-typography"]',
    )!
    expect(block.hasAttribute("data-bc-block-lh")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-block-lh")).toBe("1.8")
  })

  it("projects the document text color pair on the root, matching RootBlockComponent", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const snapshot = wrapRoot([createParagraphFixture("paragraph-1", "colored")])
    snapshot.props = {color: "#E9E4D8"}

    renderer.render(host, snapshot)

    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    expect(root.style.color).toBe("rgb(233, 228, 216)")
    expect(root.style.getPropertyValue("--bc-color")).toBe("#E9E4D8")
  })

  describe("divider parity with DividerBlockComponent", () => {
    it("renders the text variant with segments, label styling and align attribute", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()
      const divider: IBlockSnapshot = {
        id: "divider-text",
        flavour: "divider",
        nodeType: BlockNodeType.void,
        meta: {},
        props: {text: "记录下来", align: "left", length: "full", thickness: "thin", color: "#DFAB01"},
        children: [],
      }

      renderer.render(host, wrapRoot([divider]))

      const content = host.querySelector<HTMLElement>('[data-block-id="divider-text"] > .bc-block-content')!
      expect(content).not.toBeNull()
      const line = content.querySelector<HTMLElement>(".divide-line-text")!
      expect(line).not.toBeNull()
      expect(line.dataset["length"]).toBe("full")
      expect(line.dataset["thickness"]).toBe("thin")
      expect(line.dataset["align"]).toBe("left")
      expect(line.querySelectorAll(".divide-seg").length).toBe(2)
      const label = line.querySelector<HTMLElement>(".divide-label")!
      expect(label.textContent).toBe("记录下来")
      expect(label.style.color).toBe("rgb(223, 171, 1)")
    })

    it("maps the deprecated size prop through the shared resolver", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()
      const divider: IBlockSnapshot = {
        id: "divider-legacy",
        flavour: "divider",
        nodeType: BlockNodeType.void,
        meta: {},
        props: {size: "thin", style: "dashed"},
        children: [],
      }

      renderer.render(host, wrapRoot([divider]))

      const line = host.querySelector<HTMLElement>(".divide-line")!
      expect(line.classList.contains("dashed")).toBeTrue()
      expect(line.dataset["length"]).toBe("short")
      expect(line.dataset["thickness"]).toBe("thin")
    })
  })

  describe("always-placeholder projection (meta.plh / plhMode)", () => {
    const placeholderParagraph = (text: string, hint = "请在此填写内容"): IBlockSnapshot => ({
      id: "plh-paragraph",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      meta: {plh: hint, plhMode: "always"},
      props: {},
      children: text ? [{insert: text}] : [],
    })

    it("projects the editor's placeholder CSS contract on empty editable blocks", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()

      renderer.render(host, wrapRoot([placeholderParagraph("")]))

      const block = host.querySelector<HTMLElement>('[data-block-id="plh-paragraph"]')!
      const content = block.querySelector<HTMLElement>(".edit-container")!
      expect(content.getAttribute("data-placeholder")).toBe("请在此填写内容")
      expect(content.classList.contains("bc-placeholder-target")).toBeTrue()
      expect(block.classList.contains("bc-placeholder-empty")).toBeTrue()
      // The hint is an absolutely-positioned ::before — the container needs a
      // real line box (filler <br>) or the block collapses and the hint bleeds.
      expect(content.querySelector("br")).not.toBeNull()
    })

    it("clears the placeholder through incremental updates once content arrives", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()

      renderer.render(host, wrapRoot([placeholderParagraph("")]))
      renderer.update(wrapRoot([placeholderParagraph("已经填写")]))

      const block = host.querySelector<HTMLElement>('[data-block-id="plh-paragraph"]')!
      expect(block.textContent).toContain("已经填写")
      expect(block.classList.contains("bc-placeholder-empty")).toBeFalse()
      expect(block.querySelector("[data-placeholder]")).toBeNull()
    })

    it("refreshes the hint through incremental updates when only meta.plh changes", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()

      renderer.render(host, wrapRoot([placeholderParagraph("", "请填写姓名")]))
      renderer.update(wrapRoot([placeholderParagraph("", "请填写工号")]))

      const content = host.querySelector<HTMLElement>(".edit-container")!
      expect(content.getAttribute("data-placeholder")).toBe("请填写工号")
    })

    it("projects the hint on empty editable word-art blocks too", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer()
      const wordArt: IBlockSnapshot = {
        id: "wa-plh",
        flavour: "word-art",
        nodeType: BlockNodeType.editable,
        meta: {plh: "请输入标题", plhMode: "always"},
        props: {},
        children: [],
      }

      renderer.render(host, wrapRoot([wordArt]))

      const block = host.querySelector<HTMLElement>('[data-block-id="wa-plh"]')!
      expect(block.querySelector("[data-placeholder]")).not.toBeNull()
      expect(block.classList.contains("bc-placeholder-empty")).toBeTrue()
    })
  })

  describe("host extensions (options.blockRenderers / options.inlineEmbeds)", () => {
    it("renders a custom flavour through options.blockRenderers and patches it in place", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        blockRenderers: [{
          canRender: (snapshot) => `${snapshot.flavour}` === "weather-material",
          render: (_ctx, snapshot) => {
            const element = document.createElement("div")
            element.classList.add("weather-material")
            element.textContent = `weather:${snapshot.props["city"]}`
            return {element}
          },
        }],
      })

      renderer.render(host, wrapRoot([createVoidMaterialFixture("weather-1", {city: "北京"})]))
      const block = host.querySelector<HTMLElement>('[data-block-id="weather-1"]')
      expect(block).not.toBeNull()
      expect(block!.textContent).toBe("weather:北京")

      renderer.update(wrapRoot([createVoidMaterialFixture("weather-1", {city: "上海"})]))
      expect(host.querySelector('[data-block-id="weather-1"]')).toBe(block)
      expect(block!.textContent).toBe("weather:上海")
    })

    it("lets a custom renderer take precedence over the builtin registry", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        blockRenderers: [{
          canRender: (snapshot) => snapshot.flavour === "paragraph",
          render: () => {
            const element = document.createElement("div")
            element.classList.add("custom-paragraph")
            return {element}
          },
        }],
      })

      renderer.render(host, wrapRoot([createParagraphFixture("paragraph-1", "hi")]))

      expect(host.querySelector(".custom-paragraph")).not.toBeNull()
      expect(host.querySelector("p.paragraph-block")).toBeNull()
    })

    it("renders custom inline embeds on first render and through incremental updates", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        inlineEmbeds: {
          person: (delta) => {
            const span = document.createElement("span")
            span.classList.add("person-embed")
            span.textContent = `@${delta.insert["person"]}`
            return span
          },
        },
      })

      renderer.render(host, wrapRoot([createPersonParagraphFixture("Alice")]))
      expect(host.querySelector(".person-embed")!.textContent).toBe("@Alice")

      renderer.update(wrapRoot([createPersonParagraphFixture("Bob")]))
      expect(host.querySelector(".person-embed")!.textContent).toBe("@Bob")
    })

    it("delegates updates to a custom renderer's patch and stops engine syncing", () => {
      const host = document.createElement("div")
      const patched: string[] = []
      const renderer = createSnapshotRenderer({
        blockRenderers: [{
          canRender: (snapshot) => `${snapshot.flavour}` === "weather-material",
          render: (_ctx, snapshot) => {
            const element = document.createElement("div")
            const label = document.createElement("span")
            label.textContent = `render:${snapshot.props["city"]}`
            element.append(label)
            return {element}
          },
          patch: (_ctx, current, next) => {
            patched.push(`${next.props["city"]}`)
            current.element.querySelector("span")!.textContent = `patched:${next.props["city"]}`
          },
        }],
      })

      renderer.render(host, wrapRoot([createVoidMaterialFixture("weather-1", {city: "北京"})]))
      const block = host.querySelector('[data-block-id="weather-1"]')
      renderer.update(wrapRoot([createVoidMaterialFixture("weather-1", {city: "上海"})]))

      expect(patched).toEqual(["上海"])
      expect(host.querySelector('[data-block-id="weather-1"]')).toBe(block)
      // The renderer owns the update — the engine must not overwrite its DOM
      // with a fresh render ("render:上海") via syncElement.
      expect(block!.textContent).toBe("patched:上海")
    })

    it("falls back to the generic inline chip when a custom embed renderer returns a non-element", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        inlineEmbeds: {
          person: () => null as unknown as HTMLElement,
        },
      })

      renderer.render(host, wrapRoot([createPersonParagraphFixture("Alice")]))

      const chip = host.querySelector<HTMLElement>(".bc-snapshot-inline-embed")
      expect(chip).not.toBeNull()
      // append(null) would stringify — the literal text "null" must never appear.
      expect(host.textContent).not.toContain("null")
    })

    it("does not let an unmarked wrapper adopt a nested block's marked container", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        blockRenderers: [{
          canRender: (snapshot) => `${snapshot.flavour}` === "material-frame",
          render: (ctx, snapshot) => {
            const element = document.createElement("div")
            const body = document.createElement("div")
            // Deliberately NOT marked with data-bc-snapshot-children.
            for (const child of snapshot.children as IBlockSnapshot[]) {
              body.append(ctx.renderBlock(child))
            }
            element.append(body)
            return {element}
          },
        }, {
          canRender: (snapshot) => `${snapshot.flavour}` === "material-card",
          render: (ctx, snapshot) => {
            const element = document.createElement("div")
            const body = document.createElement("div")
            body.setAttribute("data-bc-snapshot-children", "")
            for (const child of snapshot.children as IBlockSnapshot[]) {
              body.append(ctx.renderBlock(child))
            }
            element.append(body)
            return {element}
          },
        }],
      })
      const frame = (text: string): IBlockSnapshot => ({
        id: "frame-1",
        flavour: "material-frame" as BlockCraft.BlockFlavour,
        nodeType: BlockNodeType.block,
        meta: {},
        props: {},
        children: [{
          id: "card-1",
          flavour: "material-card" as BlockCraft.BlockFlavour,
          nodeType: BlockNodeType.block,
          meta: {},
          props: {},
          children: [createParagraphFixture("card-paragraph", text)],
        } as unknown as IBlockSnapshot],
      } as unknown as IBlockSnapshot)

      renderer.render(host, wrapRoot([frame("before")]))
      renderer.update(wrapRoot([frame("after")]))

      // The card must still own exactly its one paragraph — an ownership leak
      // would splice the frame's children into the card and trim its real ones.
      const card = host.querySelector<HTMLElement>('[data-block-id="card-1"]')!
      const container = card.querySelector<HTMLElement>("[data-bc-snapshot-children]")!
      expect(container.querySelectorAll('[data-block-id="card-paragraph"]').length).toBe(1)
      expect(container.textContent).toContain("after")
    })

    it("falls back to the generic inline chip when a custom embed renderer throws", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        inlineEmbeds: {
          person: () => {
            throw new Error("boom")
          },
        },
      })

      renderer.render(host, wrapRoot([createPersonParagraphFixture("Alice")]))

      const chip = host.querySelector<HTMLElement>(".bc-snapshot-inline-embed")
      expect(chip).not.toBeNull()
      expect(chip!.dataset["inlineEmbed"]).toBe("person")
    })

    it("mounts and patches children of a custom container renderer via data-bc-snapshot-children", () => {
      const host = document.createElement("div")
      const renderer = createSnapshotRenderer({
        blockRenderers: [{
          canRender: (snapshot) => `${snapshot.flavour}` === "material-card",
          render: (ctx, snapshot) => {
            const element = document.createElement("div")
            const body = document.createElement("div")
            body.setAttribute("data-bc-snapshot-children", "")
            for (const child of snapshot.children as IBlockSnapshot[]) {
              body.append(ctx.renderBlock(child))
            }
            element.append(body)
            return {element}
          },
        }],
      })
      const card = (text: string): IBlockSnapshot => ({
        id: "card-1",
        flavour: "material-card" as BlockCraft.BlockFlavour,
        nodeType: BlockNodeType.block,
        meta: {},
        props: {},
        children: [createParagraphFixture("card-paragraph", text)],
      })

      renderer.render(host, wrapRoot([card("before")]))
      const child = host.querySelector('[data-block-id="card-paragraph"]')
      expect(child).not.toBeNull()

      renderer.update(wrapRoot([card("after")]))
      expect(host.querySelector('[data-block-id="card-paragraph"]')).toBe(child)
      expect(host.textContent).toContain("after")
    })
  })
})

function createParagraphFixture(id: string, text: string): IBlockSnapshot {
  return {
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
    },
    children: [{insert: text}],
  }
}

function createParagraphWithInlineFixture(
  id: string,
  children: InlineModel,
): IBlockSnapshot {
  return {
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
    },
    children,
  }
}

function createRenderUnitFixture(
  id: string,
  props: IBlockSnapshot["props"],
): IBlockSnapshot {
  return {
    id,
    flavour: "render-unit",
    nodeType: BlockNodeType.block,
    meta: {},
    props,
    children: [createParagraphFixture(`${id}-paragraph`, "region content")],
  }
}

function createTextBoxFixture(
  id: string,
  props: IBlockSnapshot["props"],
): IBlockSnapshot {
  return {
    id,
    flavour: "text-box",
    nodeType: BlockNodeType.block,
    meta: {},
    props,
    children: [createParagraphFixture(`${id}-paragraph`, "text box content")],
  }
}

function createVoidMaterialFixture(
  id: string,
  props: IBlockSnapshot["props"],
): IBlockSnapshot {
  return {
    id,
    // Host flavours live in the consumer's IBlockComponents augmentation.
    flavour: "weather-material" as BlockCraft.BlockFlavour,
    nodeType: BlockNodeType.void,
    meta: {},
    props,
    children: [],
  }
}

function createPersonParagraphFixture(person: string): IBlockSnapshot {
  return {
    id: "person-paragraph",
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {},
    children: [
      {insert: "hi "},
      {insert: {person}},
    ],
  }
}

function wrapRoot(children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id: "root-test",
    flavour: "root",
    nodeType: BlockNodeType.root,
    meta: {},
    props: {},
    children,
  }
}

function wrapPlacement(children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id: "placement-layout-test",
    flavour: "placement-layout",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {},
    children,
  }
}
