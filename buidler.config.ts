import {BuidlerConfig, usePlugin} from "@nomiclabs/buidler/config";

usePlugin("@nomiclabs/buidler-truffle5");

const config: BuidlerConfig = {
  paths: {
    sources: "./contracts"
  }
};

export default config;
