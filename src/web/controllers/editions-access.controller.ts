import { Hub, PlanType } from "@/generated/prisma/client";

import { Domain } from "../../domain/domain";
import { StatusCodes } from "http-status-codes";
import z from "zod";

import { Request, Response } from "express";
import { assertReqUserIdIsDefined } from "../middleware";

export class EditionsAccessController {
  constructor(private readonly domain: Domain) {}
  handleHasAccess = async (req: Request, res: Response) => {
    const { edition, hub } = z
      .object({
        edition: z.number().nonnegative(),
        hub: z.enum(Hub),
      })
      .parse({
        edition: +String(req.query.edition),
        hub: req.query.hub,
      });
    assertReqUserIdIsDefined(req);

    const access = await this.domain.editions.getUserEditionAccess(req.userId, [
      PlanType.FULL,
      PlanType.DIGITAL,
    ]);
    const canAccess = access.some(
      (a) => a.edition?.number === edition && a.edition.hub === hub,
    );
    res.status(StatusCodes.OK).json({
      canAccess,
    });
  };
}
