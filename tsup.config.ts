import { defineConfig } from "tsup";

/**
 * Cấu hình build bundle cho Pulse Client SDK.
 * Xuất ra hai định dạng chuẩn ESM và CJS kèm theo file d.ts type definitions.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "es2022"
});

