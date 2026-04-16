export const markdownStreamFixtures = {
  paragraphStable: {
    previousText: "",
    nextText: "Hello world\n\n",
    finalized: false,
  },
  fencedCodePending: {
    previousText: "",
    nextText: "```ts\nconst x = 1;\n",
    finalized: false,
  },
  fencedCodeReady: {
    previousText: "",
    nextText: "```ts\nconst x = 1;\n```\n",
    finalized: false,
  },
  mermaidPending: {
    previousText: "",
    nextText: "```mermaid\ngraph TD\nA-->B\n",
    finalized: false,
  },
  mermaidReady: {
    previousText: "",
    nextText: "```mermaid\ngraph TD\nA-->B\n```\n",
    finalized: false,
  },
  tablePending: {
    previousText: "",
    nextText: "| A | B |\n| --- | --- |\n| 1 | 2 |",
    finalized: false,
  },
  tableReady: {
    previousText: "",
    nextText: "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n",
    finalized: false,
  },
  tableFinalizeWithPrefix: {
    previousText: "Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    nextText: "Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    finalized: true,
  },
  rewriteWindow: {
    previousText: "# Old Title\n\nHello world\n\n",
    nextText: "# New Title\n\nHello world\n\n",
    finalized: false,
  },
} as const;
