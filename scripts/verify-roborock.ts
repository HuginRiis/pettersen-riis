import { verifyLoginCode } from "../src/lib/roborock.server";
const res = await verifyLoginCode("737535");
console.log(JSON.stringify(res));
