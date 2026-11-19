// Reads an access code from stdin and prints "salt:hash" (scrypt) for ADMIN_CODE_HASH. Never prints the code.
import { randomBytes, scryptSync } from "node:crypto";
let code = "";
process.stdin.on("data", (d) => (code += d));
process.stdin.on("end", () => {
  const salt = randomBytes(16);
  const hash = scryptSync(code.trim(), salt, 64, { N: 16384, r: 8, p: 1 });
  process.stdout.write(`${salt.toString("hex")}:${hash.toString("hex")}\n`);
});
