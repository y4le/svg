export type Child = Node | string | null | undefined | false;

type Props = Record<
  string,
  string | number | boolean | EventListener | null | undefined
>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "className") {
      element.className = String(value);
    } else if (key === "textContent") {
      element.textContent = String(value);
    } else if (typeof value === "boolean") {
      element.toggleAttribute(key, value);
    } else {
      element.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }

  return element;
}
