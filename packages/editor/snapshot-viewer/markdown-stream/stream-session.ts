export class MarkdownStreamSession {
  private text = ""
  private version = 0
  private finalized = false

  append(chunk: string) {
    this.text += chunk
    this.version += 1
    this.finalized = false
  }

  replace(markdown: string) {
    this.text = markdown
    this.version += 1
    this.finalized = false
  }

  finish() {
    this.finalized = true
  }

  destroy() {
    this.text = ""
    this.version = 0
    this.finalized = false
  }

  getText() {
    return this.text
  }

  getVersion() {
    return this.version
  }

  isFinalized() {
    return this.finalized
  }
}

