/** View-only split: preserve the original spelling and do not infer a suffix from MIME. */
export function splitAttachmentName(name: string): {stem: string; extension: string} {
  const dot = name.lastIndexOf('.');
  // Dotfiles and trailing dots remain part of the title.
  return dot > 0 && dot < name.length - 1
    ? {stem: name.slice(0, dot), extension: name.slice(dot)}
    : {stem: name, extension: ''};
}
