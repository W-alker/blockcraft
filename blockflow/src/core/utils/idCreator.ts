export const genUniqueID = () => {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  return Date.now() + '_' + s4() + s4() + '_' + s4()
}
