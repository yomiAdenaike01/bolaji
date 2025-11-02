import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export class ScreenController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
}
