/**
 * Von-host wiring checks. Run with the von host configured and NO api key:
 *
 *   env -u OPENROUTER_API_KEY -u TYPESAFE_API_KEY -u JEV_AGENT_KEY -u ASK_JEFF_API_KEY \
 *     ASK_JEFF_HOST=von node test/local-wiring.ts
 */
import { jeffResolvedInfo } from "../extensions/index.ts";

let failed = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failed++;
    console.error(`✗ ${label}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

const info = jeffResolvedInfo();
check("host resolves to von", info.host === "von");
check("endpoint is the local von /v1/systemone", info.url === "http://127.0.0.1:8000/v1/systemone");
check("model defaults to von-latest", info.model === "von-latest");
check("no key present (not required)", info.keyPresent === false);
check("keyRequired is false on a local endpoint", info.keyRequired === false);
check("localEndpoint detected via loopback", info.localEndpoint === true);
check("no config problems", info.configProblems.length === 0);

console.log(failed === 0 ? "\nAll von wiring checks passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);