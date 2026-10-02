import type { Prisma } from "@prisma/client";

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  key: string,
  prefix: string,
  date = new Date()
) {
  const year = date.getFullYear();
  const sequenceKey = `${key}:${year}`;

  const sequence = await tx.documentSequence.upsert({
    where: {
      key: sequenceKey
    },

    update: {
      prefix,

      nextValue: {
        increment: 1
      }
    },

    create: {
      key: sequenceKey,
      prefix,
      nextValue: 2
    }
  });

  const allocatedValue =
    sequence.nextValue - 1;

  return `${prefix}-${year}-${String(
    allocatedValue
  ).padStart(6, "0")}`;
}