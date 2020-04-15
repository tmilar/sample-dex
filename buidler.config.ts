import {BuidlerConfig, usePlugin} from "@nomiclabs/buidler/config";

usePlugin("@nomiclabs/buidler-waffle");

const config: BuidlerConfig = {
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  }
};

export default config;
