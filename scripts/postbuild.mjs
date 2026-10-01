/**
 * postbuild: Next standalone output doesn't include .next/static or
 * public/ — copy them so `node .next/standalone/server.js` serves a
 * complete app (matches the Dockerfile runner stage).
 */
import { cpSync, existsSync } from "node:fs";

const pairs = [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
];
for (const [from, to] of pairs) {
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    console.log(`postbuild: ${from} → ${to}`);
  }
}
