import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { Db } from "..";

export class EditionsWorker {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
    private readonly db: Db,
  ) {}
}
