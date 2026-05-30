export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { shutdownQueryWorkerPool } = await import("./lib/queryWorkerPool.ts");

  const shutdown = () => {
    void shutdownQueryWorkerPool();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
