import IORedis from "ioredis";
export interface Worklet {
  init(queueId: string, connection: IORedis): void;
}
