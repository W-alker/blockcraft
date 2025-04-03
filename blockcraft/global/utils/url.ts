export const isUrl = (url: string) => {
  return /https?:\/\/[^\s/$.?#].[^\s]*$/.test(url)
}
