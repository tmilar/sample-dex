process.env.TS_NODE_FILES = true;
process.env.TS_NODE_TRANSPILE_ONLY = true;

let config = {
  require: ["ts-node/register"],
  timeout: 8000
};

module.exports = config
