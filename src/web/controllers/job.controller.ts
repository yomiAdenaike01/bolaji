import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { EmailEventType } from "@/generated/prisma/enums";
import { EmailType } from "@/infra/integrations/email-types";
import { Request, Response } from "express";
import z from "zod";
import { createErrorResponse } from "./utils";
import { StatusCodes } from "http-status-codes";
import { logger } from "@/lib/logger";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class JobController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
  handleBroadcast = async (req: Request, res: Response) => {
    try {
      const { recipients, campaign, subject } = z
        .object({
          recipients: z.string().min(1).array(),
          campaign: z.enum(EmailType),
          subject: z.string().min(1),
        })
        .parse(req.body);

      const batches = chunk(recipients, 20);

      const totalWindowMs = 6 * 60 * 60 * 1000;
      const intervalMs =
        batches.length <= 1
          ? 0
          : Math.floor(totalWindowMs / (batches.length - 1));

      await this.domain.jobQueues.getEmailQueue().addBulk(
        batches.map((batchEmails, i) => ({
          name: "email.broadcast",
          data: { campaign, recipients: batchEmails, subject },
          opts: {
            delay: i * intervalMs,
            attempts: 5,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: 5000,
            jobId: `campaign_${campaign}_batch_${i}`,
          },
        })),
      );
      res.status(StatusCodes.OK).json({ success: true });
    } catch (error) {
      logger.error(
        `[handleBroadcast] Failed to queue broadcast job err=${(error as any).message}`,
      );
      createErrorResponse(res, {
        endpoint: "/admin/jobs",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        details: `Failed to broadcast job`,
        error: JSON.stringify(error),
      });
    }
  };
}
