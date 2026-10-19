// Runs the API server and Vite together for local development.
import { spawn } from "node:child_process";

const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
const api = run("npx", ["tsx", "watch", "server/dev-server.ts"]);
const web = run("npx", ["vite"]);
const stop = () => {
  api.kill();
  web.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", stop);
web.on("exit", stop);
