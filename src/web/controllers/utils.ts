import { logger } from "@/lib/logger";
import { Response } from "express";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
export const createErrorResponse = (
  res: Response,
  err: { endpoint: string; statusCode: number; error: string; details?: any },
) => {
  logger.error(
    `[HttpError] endpoint=${err.endpoint} error=${err.error} details=${JSON.stringify(err.details)} status=${err.statusCode}`,
  );
  res
    .status(err.statusCode)
    .json({ error: err.error, details: err.details || null });
};

export const toIssuesList = <T extends { message: string; path?: string }[]>(
  issues: T,
) => {
  return issues.map((i) => ({ message: i.message, path: i.path }));
};

export const invalidInputErrorResponse = <T extends Array<{ message: string }>>(
  res: Response,
  errors: T,
  endpoint: string,
) => {
  return createErrorResponse(res, {
    statusCode: StatusCodes.BAD_REQUEST,
    details: toIssuesList(errors),
    error: "Invalid input",
    endpoint,
  });
};
