export type SourceVersion = number & {
  readonly __sourceVersion: unique symbol;
};

export function sourceVersion(value: number): SourceVersion {
  return value as SourceVersion;
}
