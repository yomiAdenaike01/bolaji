import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { EmailEventType } from "@/generated/prisma/enums";
import { Request, Response } from "express";
import z from "zod";

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
    const { recipients, campaign } = z
      .object({
        recipients: z.string().min(1).array(),
        campaign: z.enum(EmailEventType),
      })
      .parse(req.body);

    const now = Date.now();

    const batches = chunk(recipients, 20);

    const totalWindowMs = 3 * 24 * 60 * 60 * 1000;
    const intervalMs =
      batches.length <= 1
        ? 0
        : Math.floor(totalWindowMs / (batches.length - 1));

    await this.domain.jobQueues.getEmailQueue().addBulk(
      batches.map((batchEmails, i) => ({
        name: "email.broadcast",
        data: { campaign, recipients: batchEmails },
        opts: {
          delay: i * intervalMs,
          attempts: 5,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 5000,
          jobId: `campaign:${campaign}:batch:${i}`,
        },
      })),
    );
  };
}
