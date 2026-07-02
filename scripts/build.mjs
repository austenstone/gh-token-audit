import { build } from "esbuild";
import { chmodSync } from "node:fs";

const requireShim =
  "import { createRequire as __cr } from 'node:module';" +
  "import { fileURLToPath as __f } from 'node:url';" +
  "import { dirname as __d } from 'node:path';" +
  "const require = __cr(import.meta.url);" +
  "const __filename = __f(import.meta.url);" +
  "const __dirname = __d(__filename);";

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  legalComments: "none",
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.mjs",
  banner: { js: `#!/usr/bin/env node\n${requireShim}` },
});
chmodSync("dist/cli.mjs", 0o755);

await build({
  ...common,
  entryPoints: ["src/action.ts"],
  outfile: "dist/action.mjs",
  banner: { js: requireShim },
});

console.log("build complete");
