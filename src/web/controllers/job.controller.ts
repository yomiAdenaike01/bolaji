import { Config } from "@/config/index.js";
import { PREORDER_OPENING_DATETIME } from "@/constants/index.js";
import { Domain } from "@/domain/domain.js";
import { logger } from "@/lib/logger.js";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export class JobController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
  handleSendWaitlist = async (req: Request, res: Response) => {
    try {
      const waitlist = req.body;
      const apiKey = req.headers["x-api-key"];

      if (apiKey !== this.config.adminApiKey) {
        return res
          .status(StatusCodes.UNAUTHORIZED)
          .json({ error: "Unauthorized" });
      }

      const releaseDate = PREORDER_OPENING_DATETIME;
      const jobId = `email.preorders_open-${releaseDate.toISOString()}`;

      // Remove existing job if any
      const existing = await this.domain.jobQueues
        .getEmailQueue()
        .getJob(jobId);

      if (existing) {
        await existing.remove();
        logger.info(`[Scheduler] Removed old preorder job: ${jobId}`);
      }

      // Re-add job with updated data
      await this.domain.jobQueues.addPreorderOpeningJob({ waitlist });

      logger.info(
        `[JobController] Updated preorder job ${jobId} with new data`,
      );
      return res.json({ message: "Preorder job updated successfully" });
    } catch (error) {
      res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ error: "Failed to queue wailist" });
    }
  };
}
