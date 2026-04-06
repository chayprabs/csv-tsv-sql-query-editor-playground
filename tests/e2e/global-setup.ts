import { ensureGeneratedFixtures } from "../helpers/generatedFixtures.ts";

async function globalSetup() {
  await ensureGeneratedFixtures();
}

export default globalSetup;
