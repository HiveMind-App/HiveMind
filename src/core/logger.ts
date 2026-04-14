import { brand } from "../brand.js";

type Level = "silent" | "info" | "debug";

const order: Record<Level, number> = { silent: 0, info: 1, debug: 2 };
const currentLevel: Level =
  (process.env.HIVEMIND_LOG_LEVEL as Level) || "info";

function enabled(level: Level): boolean {
  return order[level] <= order[currentLevel];
}

export const log = {
  info(msg: string): void {
    if (enabled("info")) console.log(brand.accentSoft("›"), msg);
  },
  success(msg: string): void {
    if (enabled("info")) console.log(brand.success("✓"), msg);
  },
  warn(msg: string): void {
    if (enabled("info")) console.log(brand.warn("!"), msg);
  },
  error(msg: string): void {
    console.log(brand.error("✗"), msg);
  },
  debug(msg: string): void {
    if (enabled("debug")) console.log(brand.dim("· " + msg));
  },
  dim(msg: string): void {
    if (enabled("info")) console.log(brand.dim(msg));
  },
};
