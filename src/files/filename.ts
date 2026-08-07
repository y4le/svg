const INVALID_LEAF_CHARACTERS = /[<>:"/\\|?*]/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function normalizeSvgFilename(value: string): string | null {
  const filename = value.trim();
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.toLowerCase() === ".svg" ||
    filename.endsWith(".") ||
    INVALID_LEAF_CHARACTERS.test(filename) ||
    hasControlCharacter(filename) ||
    WINDOWS_DEVICE_NAME.test(filename)
  ) {
    return null;
  }

  return /\.svg$/iu.test(filename) ? filename : `${filename}.svg`;
}
