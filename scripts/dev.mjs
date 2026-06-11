import { spawn } from "node:child_process";

const processes = [
  {
    name: "web",
    command: "npm",
    args: ["run", "dev", "--workspace", "@scribeflow/web"],
  },
  {
    name: "api",
    command: "npm",
    args: ["run", "dev", "--workspace", "@scribeflow/api"],
  },
];

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      process.stderr.write(
        `[${name}] exited with code ${code}${signal ? ` (${signal})` : ""}\n`,
      );
      shutdown();
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
