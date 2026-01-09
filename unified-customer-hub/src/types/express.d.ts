import { Request } from 'express';

// ═══════════════════════════════════════════════════════════════════════════════
// Extended Express Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuthenticatedUser {
  id: number;
  username: string;
  email?: string;
  fullName?: string;
  roleId: number;
  roleName: string;
  permissions: Record<string, string[]>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
