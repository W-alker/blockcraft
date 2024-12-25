export const purifyString = (str: string) => {
  return str.replaceAll('\u00A0', ' ').replaceAll('\u200B', '')
}
