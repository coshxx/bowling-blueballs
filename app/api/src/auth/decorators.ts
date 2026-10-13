import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthedRequest, SessionUser } from './session';

export const IS_PUBLIC = 'isPublic';
export const ADMIN_ONLY = 'adminOnly';

/** Route ohne Login erreichbar. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route nur für Admins. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => context.switchToHttp().getRequest<AuthedRequest>().user!,
);
