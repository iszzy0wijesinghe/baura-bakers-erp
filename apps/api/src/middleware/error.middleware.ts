import { Prisma } from "@prisma/client";
import type {
  NextFunction,
  Request,
  Response
} from "express";

export function notFoundHandler(
  req: Request,
  res: Response
) {
  return res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(
    "Unhandled API error:",
    err
  );

  if (
    err instanceof
    Prisma.PrismaClientKnownRequestError
  ) {
    if (err.code === "P2002") {
      return res.status(409).json({
        message:
          "A record with the same unique value already exists."
      });
    }

    if (err.code === "P2025") {
      return res.status(404).json({
        message:
          "The requested record could not be found."
      });
    }
  }

  if (err instanceof Error) {
    return res.status(500).json({
      message: err.message
    });
  }

  return res.status(500).json({
    message: "Internal server error"
  });
}