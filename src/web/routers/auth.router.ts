import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthGuard } from "../middleware.js";

export const makeAuthRouter = (
  authGuard: AuthGuard,
  authController: AuthController,
) => {
  const r = Router();
  r.post("/authenticate", authController.handleAuthenticateUser);
  r.post("/login", authController.handlePortalLogin);

  r.post("/reset-password", authController.handleResetPassword);
  r.get("/is-valid", authGuard, (req, res) => {
    const tknContext = (req as any)?.context; // returned from parseOrThrow()

    if (!tknContext || tknContext === "preorder") {
      return res.status(200).json({ isValid: true, context: "preorder" });
    }

    // Otherwise block
    return res.status(403).json({
      isValid: false,
      reason: "not preorder user",
    });
  });

  return r;
};
