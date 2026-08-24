import { defineConfig, type Plugin } from "vite";

const devAllowedHosts = (process.env.DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

function restoreTailnetRequestUrl(requestUrl: string, path: string): string {
  const base = `${path}/`;
  const suffixIndex = requestUrl.search(/[?#]/);
  const pathname =
    suffixIndex === -1 ? requestUrl : requestUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : requestUrl.slice(suffixIndex);

  if (pathname === path) return `${base}${suffix}`;
  if (pathname.startsWith(base)) return requestUrl;
  return `${path}${pathname.startsWith("/") ? "" : "/"}${pathname}${suffix}`;
}

function restoreTailnetPath(path: string): Plugin {
  return {
    name: "restore-tailnet-path",
    configureServer(server) {
      // Tailscale Serve removes its mount path before proxying. Restore it for
      // Vite's HTTP middleware and HMR WebSocket upgrade handler.
      server.httpServer?.prependListener(
        "upgrade",
        (request: { url?: string }) => {
          request.url = restoreTailnetRequestUrl(request.url ?? "/", path);
        },
      );
      server.middlewares.use((request, _response, next) => {
        request.url = restoreTailnetRequestUrl(request.url ?? "/", path);
        next();
      });
    },
  };
}

export default defineConfig(() => {
  const tailnetPath = process.env.SVG_TAILNET_PATH;

  return {
    base: tailnetPath ? `${tailnetPath}/` : "/",
    plugins: tailnetPath ? [restoreTailnetPath(tailnetPath)] : [],
    server: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      allowedHosts: devAllowedHosts,
      ...(tailnetPath
        ? { hmr: { protocol: "wss", clientPort: 443 } as const }
        : {}),
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    },
  };
});
