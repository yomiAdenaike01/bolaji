import { FAQS } from "@/config/faq.js";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export class FaqController {
  constructor() {}
  handleGetFaqs = (req: Request, res: Response) => {
    res.status(StatusCodes.OK).json(FAQS);
  };
}
