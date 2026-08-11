import {
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Wraps all controller return values in a consistent response shape:
 * { success: true, data: <controller return value> }
 *
 * If the controller already returns { success: true, ... }, it passes through.
 */
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // If already has success field, pass through
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
