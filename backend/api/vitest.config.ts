import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/**
 * Vitest's default transform is esbuild, which implements
 * experimentalDecorators but NOT emitDecoratorMetadata — so
 * Reflect.getMetadata('design:paramtypes'/'design:type', ...) comes back
 * empty under plain esbuild. NestJS relies on exactly that metadata for
 * ValidationPipe's DTO type detection on @Body()/@Param() parameters (and,
 * without explicit @Inject() tokens, for constructor injection too).
 *
 * Swapping the transform to SWC with decoratorMetadata enabled makes the
 * test runner emit the same metadata tsc/ts-node would, so behavior under
 * `vitest run` actually matches the real `pnpm build && node dist/main.js`
 * path instead of silently diverging from it.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    // Several e2e spec files now each boot a full Nest app + hit real
    // Postgres; running them together in one process is noticeably slower
    // than any one alone (observed auth.e2e.spec.ts go from ~3.6s solo to
    // ~15s with the full suite). Raised globally rather than per-hook so
    // this doesn't need re-patching every time another e2e file is added.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
