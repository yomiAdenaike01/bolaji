import { Config } from "@/config";
import { Domain } from "@/domain/domain";

/**
 * TODO: Add somewhere where jobs can be scheduled and handled
 */
export class JobController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
}
