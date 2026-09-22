/**
 * Local/LAN wiring checks for the von host (plaintext http endpoints).
 * Run without any API key env var:
 *
 *   env -u OPENROUTER_API_KEY -u TYPESAFE_API_KEY -u JEV_AGENT_KEY -u ASK_JEFF_API_KEY \
 *     ASK_JEFF_HOST=von node test/local-wiring.ts
 *
 * Variants:
 *   ASK_JEFF_URL=http://127.0.0.1:8000/v1/systemone         (loopback, default)
 *   ASK_JEFF_URL=http://192.168.1.56:8000/v1/systemone      (private LAN)
 *   ASK_JEFF_URL=http://example.com/v1/systemone            (public http -> rejected)
 *   WIRING_EXPECT=rejected  to assert the public-http rejection case.
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

const expectRejected = process.env.WIRING_EXPECT === "rejected";
const expectedUrl = process.env.ASK_JEFF_URL ?? "http://127.0.0.1:8000/v1/systemone";
const info = jeffResolvedInfo();

if (expectRejected) {
  check("host resolves to von", info.host === "von");
  check("public http endpoint rejected (no url)", info.url === null);
  check("config problem reported", info.configProblems.length > 0);
  check("keyRequired moot without an endpoint (false)", info.keyRequired === false);
} else {
  check("host resolves to von", info.host === "von");
  check("http url accepted", info.url === expectedUrl);
  check("model defaults to von-latest", info.model === "von-latest");
  check("no key present (not required)", info.keyPresent === false);
  check("keyRequired is false on a plaintext http endpoint", info.keyRequired === false);
  check("plaintext http endpoint detected", info.localEndpoint === true);
  check("no config problems", info.configProblems.length === 0);
}

console.log(failed === 0 ? "\nAll von wiring checks passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);