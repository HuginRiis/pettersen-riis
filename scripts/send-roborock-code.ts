import { requestLoginCode } from "../src/lib/roborock.server";
console.log(JSON.stringify(await requestLoginCode()));
