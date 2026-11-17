import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import {
  InvalidRoleError,
  DuplicateEmailError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  ProviderNotFoundError,
  NotAProviderError,
  InvalidOrderTransitionError,
  InvalidRefundInputError,
  DisputeNotFoundError,
  DisputeAlreadyClaimedError,
  DisputeNotClaimedByAdminError,
  PaymentNotFoundError,
} from "@boneyard/skeleton-core";

type ErrorCtor = new (...args: any[]) => Error;

/**
 * skeleton-core's domain errors are plain Error subclasses, not Nest
 * HttpExceptions — without this filter every one of them (duplicate email,
 * invalid credentials, invalid transition, ...) would 500 instead of
 * surfacing the correct 4xx. This is the single place that mapping lives;
 * controllers should never catch-and-rethrow these themselves.
 */
const DOMAIN_ERROR_STATUS: Array<[ErrorCtor, HttpStatus]> = [
  [InvalidRoleError, HttpStatus.BAD_REQUEST],
  [DuplicateEmailError, HttpStatus.CONFLICT],
  [InvalidCredentialsError, HttpStatus.UNAUTHORIZED],
  [InvalidRefreshTokenError, HttpStatus.UNAUTHORIZED],
  [ProviderNotFoundError, HttpStatus.NOT_FOUND],
  [NotAProviderError, HttpStatus.BAD_REQUEST],
  [InvalidOrderTransitionError, HttpStatus.CONFLICT],
  [InvalidRefundInputError, HttpStatus.BAD_REQUEST],
  [DisputeNotFoundError, HttpStatus.NOT_FOUND],
  [DisputeAlreadyClaimedError, HttpStatus.CONFLICT],
  [DisputeNotClaimedByAdminError, HttpStatus.FORBIDDEN],
  [PaymentNotFoundError, HttpStatus.NOT_FOUND],
];

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // Built-in Nest exceptions (guards, ValidationPipe, etc.) already carry
    // the right status — pass them through unchanged.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    for (const [ErrorClass, status] of DOMAIN_ERROR_STATUS) {
      if (exception instanceof ErrorClass) {
        const err = exception as Error;
        response.status(status).json({
          statusCode: status,
          error: err.name,
          message: err.message,
        });
        return;
      }
    }

    // Unrecognized error — log server-side, never leak internals to the client.
    console.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "InternalServerError",
      message: "An unexpected error occurred.",
    });
  }
}
