export function readDemoShortname(search: string): string | null {
  return new URLSearchParams(search).get("demo");
}

export function withDemoShortname(url: URL, shortname: string | null): URL {
  const next = new URL(url);
  if (shortname === null) next.searchParams.delete("demo");
  else next.searchParams.set("demo", shortname);
  return next;
}
