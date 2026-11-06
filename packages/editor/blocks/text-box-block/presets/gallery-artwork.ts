import { registerTextBoxArtwork, textBoxArtworkRef } from "./artwork";

export type GalleryDecoration =
  | "art-deco"
  | "banded"
  | "bauhaus"
  | "blueprint-grid"
  | "brackets"
  | "brushed-metal"
  | "chalk-grain"
  | "corner-accent"
  | "facet-left"
  | "facet-right"
  | "filigree"
  | "folded-corner"
  | "kraft-grain"
  | "lattice-frame"
  | "line-callout-left"
  | "line-callout-right"
  | "notebook-lines"
  | "nouveau-frame"
  | "photo-caption"
  | "quote-mark"
  | "scroll"
  | "seal-frame"
  | "split-panel"
  | "tabbed"
  | "ticket-edge"
  | "washi-grain"
  | "bottom-rule"
  | "header-rule";

const registered = new Set<string>();

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const svgUri = (body: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">${body}</svg>`,
  )}`;

function decorationSvg(
  kind: GalleryDecoration,
  accent: string,
  background = "transparent",
): string {
  const c = escapeXml(accent);
  const bg = escapeXml(background);
  const line = `fill="none" stroke="${c}" stroke-width="18"`;
  switch (kind) {
    case "banded":
      return `<path fill="${c}" d="M0 0h112v1000H0z"/><path fill="${c}" opacity=".16" d="M112 0h44v1000h-44z"/>`;
    case "facet-left":
      return `<path fill="${c}" d="M0 0h150L92 500l58 500H0z"/><path fill="${c}" opacity=".18" d="M150 0h58l-58 500 58 500h-58L92 500z"/>`;
    case "facet-right":
      return `<path fill="${c}" d="M1000 0H850l58 500-58 500h150z"/><path fill="${c}" opacity=".18" d="M850 0h-58l58 500-58 500h58l58-500z"/>`;
    case "filigree":
      return `<path ${line} d="M80 190c90-150 180 40 265-80 55-78 125-78 155 0 30-78 100-78 155 0 85 120 175-70 265 80M80 810c90 150 180-40 265 80 55 78 125 78 155 0 30 78 100 78 155 0 85-120 175 70 265-80"/><circle cx="500" cy="105" r="25" fill="${c}"/><circle cx="500" cy="895" r="25" fill="${c}"/>`;
    case "quote-mark":
      return `<text x="70" y="315" fill="${c}" opacity=".3" font-family="Georgia,serif" font-size="330" font-weight="700">“</text>`;
    case "header-rule":
      return `<path fill="${c}" d="M0 0h1000v52H0zM72 148h856v14H72z"/>`;
    case "bottom-rule":
      return `<path fill="${c}" d="M70 880h860v18H70zM70 925h520v9H70z"/>`;
    case "brackets":
      return `<path fill="none" stroke="${c}" stroke-width="30" d="M115 105H55v790h60M885 105h60v790h-60"/>`;
    case "split-panel":
      return `<path fill="${c}" opacity=".18" d="M650 0h350v1000H520z"/><path fill="${c}" d="M0 0h22v1000H0z"/>`;
    case "tabbed":
      return `<path fill="${c}" d="M0 0h1000v126H0z"/><path fill="${c}" opacity=".2" d="M0 126h1000v42H0z"/>`;
    case "ticket-edge":
      return `<g fill="${c}">${Array.from({ length: 8 }, (_, i) => `<circle cx="${i % 2 ? 1000 : 0}" cy="${80 + i * 120}" r="38"/>`).join("")}</g><path ${line} stroke-dasharray="25 22" d="M760 90v820"/>`;
    case "photo-caption":
      return `<path fill="${c}" opacity=".16" d="M55 55h890v570H55z"/><path fill="${c}" d="M55 745h600v20H55zM55 805h390v12H55z"/>`;
    case "folded-corner":
      return `<path fill="${c}" opacity=".32" d="M760 0h240v240z"/><path ${line} d="M760 0v240h240"/>`;
    case "notebook-lines":
      return `<path stroke="${c}" stroke-width="8" opacity=".38" d="M0 260h1000M0 400h1000M0 540h1000M0 680h1000M0 820h1000"/><path stroke="#d55b5b" stroke-width="10" opacity=".5" d="M155 0v1000"/>`;
    case "scroll":
      return `<path fill="${c}" opacity=".15" d="M0 0h1000v110H0zM0 890h1000v110H0z"/><path ${line} d="M55 105h890M55 895h890"/>`;
    case "lattice-frame":
      return `<path ${line} d="M45 45h910v910H45zM45 190h145V45M810 45v145h145M45 810h145v145M810 955V810h145"/><path fill="none" stroke="${c}" stroke-width="10" d="M45 45l145 145M955 45L810 190M45 955l145-145M955 955L810 810"/>`;
    case "seal-frame":
      return `<path fill="none" stroke="${c}" stroke-width="28" d="M70 70h860v860H70zM115 115h770v770H115z"/><path fill="${c}" opacity=".75" d="M770 700h150v150H770z"/>`;
    case "washi-grain":
      return `<filter id="n"><feTurbulence baseFrequency=".035" numOctaves="3" seed="7"/></filter><rect width="1000" height="1000" filter="url(#n)" opacity=".09"/>`;
    case "art-deco":
      return `<path ${line} d="M45 45h910v910H45zM90 90h820v820H90zM45 250l205-205M955 250L750 45M45 750l205 205M955 750L750 955"/><path fill="${c}" d="M430 45h140l-70 100zM430 955h140l-70-100z"/>`;
    case "bauhaus":
      return `<circle cx="820" cy="180" r="150" fill="${c}"/><rect x="0" y="700" width="430" height="300" fill="#1d4f91"/><path fill="#e8b62e" d="M0 0h250v250H0z" opacity=".9"/>`;
    case "nouveau-frame":
      return `<path ${line} d="M80 210Q80 70 220 70h560q140 0 140 140v580q0 140-140 140H220Q80 930 80 790z"/><path fill="none" stroke="${c}" stroke-width="10" d="M80 280q170-160 330 0t330 0q80-80 180 0M80 720q170 160 330 0t330 0q80 80 180 0"/>`;
    case "blueprint-grid":
      return `<defs><pattern id="g" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0v100" fill="none" stroke="${c}" stroke-width="4" opacity=".24"/><path d="M50 0v100M0 50h100" stroke="${c}" stroke-width="2" opacity=".12"/></pattern></defs><rect width="1000" height="1000" fill="url(#g)"/>`;
    case "chalk-grain":
      return `<filter id="c"><feTurbulence baseFrequency=".7" numOctaves="2" seed="11"/></filter><rect width="1000" height="1000" filter="url(#c)" opacity=".055"/><path stroke="${c}" stroke-width="10" opacity=".32" d="M80 120q210-45 420 0t420 0M80 870q210 45 420 0t420 0"/>`;
    case "brushed-metal":
      return `<defs><linearGradient id="m"><stop stop-color="#fff"/><stop offset=".45" stop-color="${c}" stop-opacity=".08"/><stop offset=".55" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="${c}" stop-opacity=".12"/></linearGradient></defs><rect width="1000" height="1000" fill="url(#m)"/><path stroke="${c}" opacity=".12" d="M0 120h1000M0 260h1000M0 460h1000M0 720h1000M0 880h1000"/>`;
    case "kraft-grain":
      return `<filter id="k"><feTurbulence baseFrequency=".12" numOctaves="2" seed="4"/></filter><rect width="1000" height="1000" filter="url(#k)" opacity=".08"/>`;
    case "corner-accent":
      return `<path fill="${c}" d="M0 0h210L0 210zM1000 1000H790l210-210z"/>`;
    case "line-callout-left":
      return `<path fill="${bg}" stroke="${c}" stroke-width="10" d="M160 80H980V920H160Z"/><path fill="none" stroke="${c}" stroke-width="10" d="M18 720L160 620"/><circle cx="18" cy="720" r="18" fill="${c}"/>`;
    case "line-callout-right":
      return `<path fill="${bg}" stroke="${c}" stroke-width="10" d="M20 80H840V920H20Z"/><path fill="none" stroke="${c}" stroke-width="10" d="M982 720L840 620"/><circle cx="982" cy="720" r="18" fill="${c}"/>`;
  }
}

/** Registers one lightweight built-in drawing and returns its persisted bc: ref. */
export function galleryArtworkRef(
  presetId: string,
  kind: GalleryDecoration,
  accent: string,
  background?: string,
): string {
  const id = `gallery-${presetId}`;
  if (!registered.has(id)) {
    registerTextBoxArtwork([
      {
        id,
        src: svgUri(decorationSvg(kind, accent, background)),
        // These are surface ornaments, not semantic sub-objects or silhouette
        // geometry. The preset's textFrame margins own the editable safe area.
        textInsets:
          kind === "line-callout-left"
            ? { top: 0.08, right: 0.02, bottom: 0.08, left: 0.16 }
            : kind === "line-callout-right"
              ? { top: 0.08, right: 0.16, bottom: 0.08, left: 0.02 }
              : { top: 0, right: 0, bottom: 0, left: 0 },
      },
    ]);
    registered.add(id);
  }
  return textBoxArtworkRef(id);
}
