import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "@boneyard/skeleton-core";

/**
 * Verifies the Bearer token via AuthService.verifyToken, which re-fetches
 * the user from the DB (not trusting stale claims baked into the token at
 * sign time) and attaches the result to request.user. Role checks happen
 * downstream in RolesGuard, which depends on this guard having already run.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  // See auth.controller.ts for why this is an explicit @Inject.
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.slice("Bearer ".length).trim();

    try {
      request.user = await this.authService.verifyToken(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
