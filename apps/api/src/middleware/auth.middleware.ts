import type {
  NextFunction,
  Request,
  Response
} from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getJwtSecret() {
  const secret =
    process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured"
    );
  }

  return secret;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader =
    req.headers.authorization;

  if (
    !authHeader?.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      message:
        "Authentication required"
    });
  }

  const token =
    authHeader.slice(
      "Bearer ".length
    );

  try {
    const decoded = jwt.verify(
      token,
      getJwtSecret()
    ) as AuthUser;

    req.user = decoded;

    return next();
  } catch {
    return res.status(401).json({
      message:
        "Your session has expired. Please sign in again."
    });
  }
}

export function requireRoles(
  ...allowedRoles: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const allowed =
      req.user.roles.some(
        (role) =>
          allowedRoles.includes(
            role
          )
      );

    if (!allowed) {
      return res.status(403).json({
        message:
          "You do not have permission to perform this action."
      });
    }

    return next();
  };
}