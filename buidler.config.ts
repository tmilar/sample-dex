import { usePlugin, BuidlerConfig } from "@nomiclabs/buidler/config";

usePlugin("@nomiclabs/buidler-waffle");
usePlugin("buidler-typechain");

//TODO config type should be BuidlerConfig, but it isn't working with buidler-typechain plugin additions
const config: any = {
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  },
  typechain: {
    outDir: "./typechain",
    target: "ethers"
  }
};

export default config;
