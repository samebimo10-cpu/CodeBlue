/** One-off: poll every topic feed, refresh subjects and build today's coverage. */
import { dailyRun, pollTopics } from "../lib/jobs";

async function main() {
const report = await pollTopics("all");
for (const [topic, r] of Object.entries(report)) {
  console.log(`${topic.padEnd(14)} fetched ${String(r.fetched).padStart(4)}  new ${String(r.inserted).padStart(4)}  errors ${r.errors.length}`);
  for (const e of r.errors) console.log(`   ! ${e}`);
}
const daily = await dailyRun();
console.log("Subjects refreshed:", Object.keys(daily.subjects).length, "Digests:", daily.digests);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
