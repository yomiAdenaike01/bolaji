import { Db } from "@/infra";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { EditionsReleaseSchedule } from "./email-release/editions-release.scheduler";
import { EditionsReleaseWorker } from "./email-release/editions-release.worker";
import IORedis from "ioredis";

export const initSchedulers = (
  connection: IORedis,
  db: Db,
  emailIntegration: EmailIntegration,
) => {
  const worker = new EditionsReleaseWorker(db, emailIntegration);
  new EditionsReleaseSchedule(connection, worker);
};
