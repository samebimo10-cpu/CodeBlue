// Runs the web app and the background worker in one service, so they share
// the same SQLite file on the same disk. If either exits, the service restarts.
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["next", "start", "-p", process.env.PORT || "3000"], { stdio: "inherit" }),
  spawn("npx", ["tsx", "scripts/worker.ts"], { stdio: "inherit" }),
];

for (const p of procs) {
  p.on("exit", (code) => {
    console.error(`A Code Blue process exited (code ${code}); stopping so the host restarts the service.`);
    for (const other of procs) other.kill("SIGTERM");
    process.exit(code ?? 1);
  });
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
