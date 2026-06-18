import { existsSync } from "node:fs";
import { resolve } from "node:path";

const seedPath = resolve("src/lib/local-data/seed.ts");

if (!existsSync(seedPath)) {
  console.error("Missing local seed file:", seedPath);
  process.exit(1);
}

console.log("Local demo seed is ready.");
console.log("Data source: src/lib/local-data/seed.ts");
console.log("Use DATA_SOURCE=local for deterministic clients, leads, properties, viewings, deals, tasks, calendar slots and market listings.");
