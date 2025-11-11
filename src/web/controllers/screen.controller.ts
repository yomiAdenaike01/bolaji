import { Config } from "@/config/index.js";
import { Domain } from "@/domain/domain.js";

export class ScreenController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
}
