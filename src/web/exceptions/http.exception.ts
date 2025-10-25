import { StatusCodes } from "http-status-codes";

export class HttpException extends Error {
  status: StatusCodes;
  details?: string[];
  constructor(status: StatusCodes, message?: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
