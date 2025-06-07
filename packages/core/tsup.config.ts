import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    clean: true,
    minify: true,
    shims: true,
    target: "node16",
    dts: true,
    noExternal: [],
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    clean: false,
    minify: true,
    shims: true,
    target: "node16",
    dts: false,
    noExternal: [],
    outExtension({ format }) {
      return { js: ".js" };
    },
  },
]);
