// pm2 processes for the ID Card Studio API. Settings come from the shared .env
// file on the server, which never enters the repository.
const fs = require("fs");
const path = require("path");

const envFile = process.env.ENV_FILE || path.join(__dirname, "..", ".env");
const env = {};
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const interpreter = process.env.NODE_BIN || "node";
const cwd = path.join(__dirname, "..");

module.exports = {
  apps: [
    { name: "id-studio-api", script: "dist/server.js", cwd, interpreter, env, max_memory_restart: "1G", kill_timeout: 10000 },
    ...(env.REDIS_URL ? [{ name: "id-studio-worker", script: "dist/worker.js", cwd, interpreter, env, max_memory_restart: "512M" }] : []),
  ],
};
