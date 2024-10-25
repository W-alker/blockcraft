import * as Prism from 'prismjs';

export class CodeDiffer {
  private previousTokens: Array<string | Prism.Token> = [];

  constructor(private language: string) {}

  /**
   * Tokenizes and diffs the new code against the previous code
   * @param code - The new code input to process
   * @returns The HTML with only the changed tokens updated
   */
  tokenizeAndDiff(code: string): string {
    // Tokenize the new code
    const newTokens = Prism.tokenize(code, Prism.languages[this.language]);

    // Compute differences
    const diffIndexes = this.diffTokens(this.previousTokens, newTokens);

    // Update previous tokens
    this.previousTokens = newTokens;

    // Render tokens with differences highlighted
    return this.tokensToHTML(newTokens, diffIndexes);
  }

  /**
   * Compares two token arrays and returns the indexes of differing tokens
   */
  private diffTokens(
    oldTokens: Array<string | Prism.Token>,
    newTokens: Array<string | Prism.Token>
  ): Set<number> {
    const diffIndexes = new Set<number>();

    const maxLen = Math.max(oldTokens.length, newTokens.length);
    for (let i = 0; i < maxLen; i++) {
      if (oldTokens[i] !== newTokens[i]) {
        diffIndexes.add(i);
      }
    }
    return diffIndexes;
  }

  /**
   * Converts tokens to HTML, marking changed tokens with a CSS class
   */
  private tokensToHTML(
    tokens: Array<string | Prism.Token>,
    diffIndexes: Set<number>
  ): string {
    return tokens
      .map((token, index) => {
        const className = diffIndexes.has(index) ? 'token-diff' : 'token';
        if (typeof token === 'string') {
          return `<span class="${className}">${token}</span>`;
        } else {
          const content = Array.isArray(token.content)
            ? this.tokensToHTML(token.content, diffIndexes)
            : token.content;
          return `<span class="${className} ${token.type}">${content}</span>`;
        }
      })
      .join('');
  }
}

// 使用示例
const differ = new CodeDiffer('javascript');
const originalCode = `function greet() { console.log("Hello, World!"); }`;
const modifiedCode = `function greetUser() { console.log("Hi!"); }`;

// 第一次生成HTML
let html = differ.tokenizeAndDiff(originalCode);
console.log(html);

// 更新后生成差异高亮的HTML
html = differ.tokenizeAndDiff(modifiedCode);
console.log(html);
