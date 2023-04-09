const fs = require("fs");
const { parsed } = require("dotenv").config();
fs.writeFileSync(`./env.json`, JSON.stringify(parsed, null, 2));
