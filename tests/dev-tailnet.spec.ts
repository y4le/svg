import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const devTailnet = join(repoRoot, "scripts/dev-tailnet.sh");

const executable = (path: string, source: string): void => {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
};

const freePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

describe("dev:tailnet launcher", () => {
  let tempRoot: string;
  let helperPath: string;
  let vitePath: string;
  let helperLog: string;
  let viteLog: string;
  let exposeMarker: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "svg-dev-tailnet-"));
    helperPath = join(tempRoot, "tailnet-dev-host");
    vitePath = join(tempRoot, "vite");
    helperLog = join(tempRoot, "helper.jsonl");
    viteLog = join(tempRoot, "vite.json");
    exposeMarker = join(tempRoot, "exposed");

    executable(
      helperPath,
      `#!/usr/bin/env node
const fs = require("node:fs");
const [command, ...args] = process.argv.slice(2);
fs.appendFileSync(process.env.HELPER_LOG, JSON.stringify([command, ...args]) + "\\n");
if (command === "status" && process.env.FAKE_STATUS_EXIT) process.exit(Number(process.env.FAKE_STATUS_EXIT));
else if (command === "status") process.stdout.write(process.env.FAKE_STATUS_JSON || '{"routes":[]}');
else if (command === "url") process.stdout.write('{"url":"https://spark.test.ts.net:4443/"}');
else if (command === "expose") {
  fs.writeFileSync(process.env.EXPOSE_MARKER, "");
  process.stdout.write('{"action":"expose","url":"https://spark.test.ts.net:4443/"}');
}
else process.exit(2);
`,
    );

    executable(
      vitePath,
      `#!/usr/bin/env node
const fs = require("node:fs");
const net = require("node:net");
const args = process.argv.slice(2);
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
fs.writeFileSync(process.env.VITE_LOG, JSON.stringify({ args, allowedHosts: process.env.DEV_ALLOWED_HOSTS }));
const server = net.createServer((socket) => socket.end("HTTP/1.1 200 OK\\r\\nContent-Length: 0\\r\\n\\r\\n"));
const closeServer = (status = 0) => server.close(() => process.exit(status));
server.listen(Number(valueAfter("--port")), valueAfter("--host"), () => {
  const markerPoll = setInterval(() => {
    if (fs.existsSync(process.env.EXPOSE_MARKER)) {
      clearInterval(markerPoll);
      closeServer();
    }
  }, 10);
});
process.on("SIGTERM", () => closeServer(143));
`,
    );
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("preflights, starts Vite, and exposes the dedicated root route", async () => {
    const port = await freePort();
    const result = spawnSync("bash", [devTailnet, "--open"], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HELPER_LOG: helperLog,
        EXPOSE_MARKER: exposeMarker,
        PORT: String(port),
        TAILNET_DEV_HOST_BIN: helperPath,
        VITE_BIN: vitePath,
        VITE_LOG: viteLog,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "tailnet URL: https://spark.test.ts.net:4443/",
    );
    expect(result.stdout).toContain("the route persists after Vite stops");

    const vite = JSON.parse(readFileSync(viteLog, "utf8")) as {
      args: string[];
      allowedHosts: string;
    };
    expect(vite.args).toEqual([
      "--open",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--clearScreen",
      "false",
    ]);
    expect(vite.allowedHosts).toBe("spark.test.ts.net");

    const helperCalls = readFileSync(helperLog, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(helperCalls.map(([command]) => command)).toEqual([
      "status",
      "url",
      "status",
      "expose",
    ]);
    expect(helperCalls.at(-1)).toEqual([
      "expose",
      "--name",
      "svg-workbench",
      "--repo",
      repoRoot,
      "--path",
      "/",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--https-port",
      "4443",
      "--force",
      "--allow-root",
      "--json",
    ]);
  });

  it("refuses a root route owned by another project before starting Vite", async () => {
    const port = await freePort();
    const result = spawnSync("bash", [devTailnet], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATUS_JSON: JSON.stringify({
          routes: [
            {
              https_port: 4443,
              live: true,
              name: "other-project",
              path: "/",
              repo: "/tmp/other-project",
              target: "http://127.0.0.1:9999",
            },
          ],
        }),
        HELPER_LOG: helperLog,
        EXPOSE_MARKER: exposeMarker,
        PORT: String(port),
        TAILNET_DEV_HOST_BIN: helperPath,
        VITE_BIN: vitePath,
        VITE_LOG: viteLog,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing to replace https:4443 /");
    expect(() => readFileSync(viteLog)).toThrow();
    expect(readFileSync(helperLog, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("rejects routing flags that could disagree with the registered target", async () => {
    const port = await freePort();
    const result = spawnSync("bash", [devTailnet, "--port", "9999"], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HELPER_LOG: helperLog,
        EXPOSE_MARKER: exposeMarker,
        PORT: String(port),
        TAILNET_DEV_HOST_BIN: helperPath,
        VITE_BIN: vitePath,
        VITE_LOG: viteLog,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("use HOST, PORT, or TAILNET_HTTPS_PORT");
    expect(() => readFileSync(helperLog)).toThrow();
  });

  it("fails closed when the helper status payload has an unknown shape", async () => {
    const port = await freePort();
    const result = spawnSync("bash", [devTailnet], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPOSE_MARKER: exposeMarker,
        FAKE_STATUS_JSON: '{"ok":true}',
        HELPER_LOG: helperLog,
        PORT: String(port),
        TAILNET_DEV_HOST_BIN: helperPath,
        VITE_BIN: vitePath,
        VITE_LOG: viteLog,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("status omitted its routes array");
    expect(() => readFileSync(viteLog)).toThrow();
  });

  it("reports an offline helper without starting Vite", async () => {
    const port = await freePort();
    const result = spawnSync("bash", [devTailnet], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPOSE_MARKER: exposeMarker,
        FAKE_STATUS_EXIT: "1",
        HELPER_LOG: helperLog,
        PORT: String(port),
        TAILNET_DEV_HOST_BIN: helperPath,
        VITE_BIN: vitePath,
        VITE_LOG: viteLog,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not inspect Tailnet routes");
    expect(() => readFileSync(viteLog)).toThrow();
  });
});
