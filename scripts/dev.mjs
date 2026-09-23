import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url));
const frontendPort = process.env.FRONTEND_PORT ?? "3000";
const backendPort = process.env.BACKEND_PORT ?? "3001";
const backendUrl = `http://127.0.0.1:${backendPort}`;
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000);
  timer.unref();
}
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}
// Refuse occupied ports so the UI cannot silently connect to an older API.
async function checkPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid port: ${value}`);
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is busy. Set FRONTEND_PORT and BACKEND_PORT to free ports.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
try {
  if (frontendPort === backendPort)
    throw new Error("Frontend and backend need different ports.");
  await checkPort(frontendPort);
  await checkPort(backendPort);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

start(
  ["--env-file-if-exists=.env", "--import", "tsx", "--watch", "src/server.ts"],
  resolve(root, "backend"),
  { PORT: backendPort },
);
start(
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    frontendPort,
  ],
  root,
  { BACKEND_URL: backendUrl },
);
console.log(
  `SkillArena: http://127.0.0.1:${frontendPort} · API: ${backendUrl}`,
);
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
