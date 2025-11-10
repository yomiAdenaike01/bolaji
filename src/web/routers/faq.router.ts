import { Router } from "express";
import { FaqController } from "../controllers/faq.controller.js";

export const makeFaqsRouter = (faqController: FaqController) => {
  const r = Router();
  r.get("/", faqController.handleGetFaqs);
  return r;
};
