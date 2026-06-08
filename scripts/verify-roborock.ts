import { verifyLoginCode } from "../src/lib/roborock.server";
const res = await verifyLoginCode("449652");
console.log(JSON.stringify(res));
