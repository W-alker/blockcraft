export const getCommonPath = (path1: string[], path2: string[]): string[] => {
  if (path1.length === 0 || path2.length === 0) return []
  const res: string[] = []
  for (let i = 0; i < path1.length; i++) {
    if (path2[i] !== path1[i]) break
    res.push(path1[i])
  }
  return res
}
