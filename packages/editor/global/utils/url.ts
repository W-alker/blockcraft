export const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*$/

export const isUrl = (url: string) => {
  return urlRegex.test(url)
}

export const figmaUrlRegex: RegExp =
  /https:\/\/[\w.-]+\.?figma.com\/([\w-]+)\/([0-9a-zA-Z]{22,128})(?:\/.*)?$/;

export const isFigmaUrl = (url: string) => {
  return figmaUrlRegex.test(url)
}

export const jueJinUrlRegex: RegExp = /https:\/\/juejin\.cn\/\w+/;

export const isJueJinUrl = (url: string) => {
  return jueJinUrlRegex.test(url)
}
