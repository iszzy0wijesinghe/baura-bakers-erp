import {
  execFile
} from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import { env } from "../config/env";

const execFileAsync =
  promisify(execFile);

type MysqlConnection = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

function parseMysqlConnection():
  MysqlConnection {
  const url =
    new URL(env.DATABASE_URL);

  if (url.protocol !== "mysql:") {
    throw new Error(
      "DATABASE_URL must use mysql://"
    );
  }

  const database =
    decodeURIComponent(
      url.pathname.replace(/^\//, "")
    );

  if (!database) {
    throw new Error(
      "DATABASE_URL does not contain a database name"
    );
  }

  return {
    host: url.hostname || "localhost",
    port: url.port || "3306",
    user: decodeURIComponent(
      url.username
    ),
    password: decodeURIComponent(
      url.password
    ),
    database
  };
}

function escapeOptionFileValue(
  value: string
) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function createTemporaryOptionFile(
  connection: MysqlConnection
) {
  const filePath = path.join(
    os.tmpdir(),
    `baura-mysql-${crypto.randomUUID()}.cnf`
  );

  const contents = [
    "[client]",
    `host="${escapeOptionFileValue(
      connection.host
    )}"`,
    `port="${escapeOptionFileValue(
      connection.port
    )}"`,
    `user="${escapeOptionFileValue(
      connection.user
    )}"`,
    `password="${escapeOptionFileValue(
      connection.password
    )}"`,
    "default-character-set=utf8mb4",
    ""
  ].join("\n");

  fs.writeFileSync(
    filePath,
    contents,
    {
      encoding: "utf8",
      mode: 0o600
    }
  );

  return filePath;
}

export function createBackupFileName() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");

  return `baura-db-backup-${timestamp}.sql`;
}

export async function createDatabaseDump(
  destinationFile: string
) {
  const connection =
    parseMysqlConnection();

  const executable =
    env.MYSQLDUMP_PATH ||
    "mysqldump";

  const optionFile =
    createTemporaryOptionFile(
      connection
    );

  fs.mkdirSync(
    path.dirname(destinationFile),
    {
      recursive: true
    }
  );

  try {
    await execFileAsync(
      executable,
      [
        `--defaults-extra-file=${optionFile}`,
        "--single-transaction",
        "--quick",
        "--skip-lock-tables",
        "--default-character-set=utf8mb4",
        `--result-file=${destinationFile}`,
        connection.database
      ]
    );
  } finally {
    fs.rmSync(
      optionFile,
      {
        force: true
      }
    );
  }
}