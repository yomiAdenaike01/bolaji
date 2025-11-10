import { AuthService } from "@/domain/auth/auth.service.js";
import { Workspace } from "@/infra/index.js";
import { buildRouter } from "@adminjs/express";

export const makeWorkspaceRouter = (workspace: Workspace) => {
  return buildRouter(workspace);
};
