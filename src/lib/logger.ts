/** Dev-only diagnostics — avoids noisy `[Luma]` logs in production builds. */
export const lumaLog = {
  info: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
