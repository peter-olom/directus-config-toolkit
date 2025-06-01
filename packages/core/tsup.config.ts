import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  clean: true,
  minify: true,
  shims: true,
  target: "node16",
  dts: true,
  noExternal: [],
});
