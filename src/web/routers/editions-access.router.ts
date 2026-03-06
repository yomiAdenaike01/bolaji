import { Router } from "express";
import { EditionsAccessController } from "../controllers/editions-access.controller";
import { AuthGuard } from "../middleware";

export const makeEditionsAccessRouter = (
  authGuard: AuthGuard,
  ctrl: EditionsAccessController,
) => {
  const r = Router();

  r.get("/", authGuard, ctrl.handleHasAccess);
  return r;
};
