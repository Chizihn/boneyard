import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@boneyard/skeleton-core";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Reads the role the request.user actually has — set by JwtAuthGuard from
 * the re-fetched DB user, never from anything the client sent. Must be
 * applied after JwtAuthGuard (@UseGuards(JwtAuthGuard, RolesGuard)), since
 * it depends on request.user already being set.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  // See auth.controller.ts for why this is an explicit @Inject.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user;
    return !!user && requiredRoles.includes(user.role);
  }
}
