import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@boneyard/skeleton-core";

/** Reads the AuthUser that JwtAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);
