import { waffle } from "@nomiclabs/buidler";
import chai from "chai";
import { solidity, deployContract } from "ethereum-waffle";

chai.use(solidity);

const { expect } = chai;

import SemiDexArtifact from "../artifacts/SemiDex.json";
import {SemiDex} from "../typechain/SemiDex"
import { BigNumber, bigNumberify } from "ethers/utils";

type NewPair = {
  pairId: BigNumber;
  tokenA: string;
  tokenB: string;
  rateAtoB: BigNumber;
}; // TODO can a contract event type be retrieved directly from typechain output?

describe("SemiDex", () => {
  const { provider } = waffle;
  const [wallet] = provider.getWallets();

  context("Admin", function() {
    it("Should be able to add a trading pair", async function() {
      console.time("await deployContract(wallet, SemiDexArtifact)")
      const semiDex = (await deployContract(
        wallet,
        SemiDexArtifact
      )) as SemiDex;
      console.timeEnd("await deployContract(wallet, SemiDexArtifact)")

      // check initial pairs count
      console.time("const pairsCountBefore = await semiDex.pairsCount();")
      const pairsCountBefore = await semiDex.pairsCount();
      console.timeEnd("const pairsCountBefore = await semiDex.pairsCount();")

      expect(pairsCountBefore).to.be.equal(0);

      // watch for 'NewPair' event
      const newPairEventPromise = new Promise<NewPair>((resolve, reject) => {
        semiDex.once("NewPair", function(
          pairId,
          tokenA,
          tokenB,
          rateAtoB
        ) {
          resolve({ pairId, tokenA, tokenB, rateAtoB });
        });

        setTimeout(() => {
          reject(new Error("newPairEventPromise timeout"));
        }, 60000);
      });

      const testPair = {
        tokenA: "ETH",
        tokenB: "USDC",
        rateAtoB: bigNumberify(185)
      };

      // add the new exchange pair

      console.time("await semiDex.addPair(testPair.tokenA, testPair.tokenB, testPair.rateAtoB);")
      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB
      );
      console.timeEnd("await semiDex.addPair(testPair.tokenA, testPair.tokenB, testPair.rateAtoB);")

      // retrieve NewPair event from result
      console.time("const newPairEvent = await newPairEventPromise;")
      const newPairEvent = await newPairEventPromise;
      console.timeEnd("const newPairEvent = await newPairEventPromise;")

      if (newPairEvent === undefined) {
        expect.fail(newPairEvent, { event: "NewPair" }, "No new pair event");
        return;
      }

      // expect NewPair event info to be correct
      const { pairId, tokenA, tokenB, rateAtoB } = newPairEvent;
      expect(testPair.tokenA).to.equal(testPair.tokenA, tokenA);
      expect(testPair.tokenB).to.equal(tokenB);
      expect(testPair.rateAtoB).to.equal(rateAtoB);

      // expect pair to be stored in contract pairs array
      console.time("const pairsCountAfter = await semiDex.pairsCount();")
      const pairsCountAfter = await semiDex.pairsCount();
      console.timeEnd("const pairsCountAfter = await semiDex.pairsCount();")

      console.time("const pair = await semiDex.pairs(pairId);")
      const pair = await semiDex.pairs(pairId);
      console.timeEnd("const pair = await semiDex.pairs(pairId);")

      expect(pairsCountAfter).to.equal(1);

      // expect stored pair info to be correct
      expect(testPair.tokenA).to.equal(pair.tokenA);
      expect(testPair.tokenB).to.equal(pair.tokenB);
      expect(testPair.rateAtoB).to.equal(pair.rateAtoB);
    });
  });
});
