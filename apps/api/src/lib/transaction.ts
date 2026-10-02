import {
  Prisma
} from "@prisma/client";

import {
  prisma
} from "./prisma";

export async function runSerializableTransaction<T>(
  callback: (
    tx: Prisma.TransactionClient
  ) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError:
    unknown;

  for (
    let attempt = 1;
    attempt <=
    maxRetries;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        callback,
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable
        }
      );
    } catch (error) {
      lastError =
        error;

      const retryable =
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2034";

      if (
        !retryable ||
        attempt ===
          maxRetries
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}