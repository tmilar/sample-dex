import { waffle } from "@nomiclabs/buidler";
import chai from "chai";
import { solidity, deployContract } from "ethereum-waffle";

chai.use(solidity);

const { expect } = chai;

import SemiDexArtifact from "../artifacts/SemiDex.json";
import { SemiDex } from "../typechain/SemiDex";
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
    let semiDex: SemiDex;
    let initialPairsCount: number;

    beforeEach(async () => {
      semiDex = (await deployContract(wallet, SemiDexArtifact)) as SemiDex;

      // check initial pairs count
      initialPairsCount = await semiDex.pairsCount();
      expect(initialPairsCount).to.be.equal(0);
    });

    it("Should be able to add a trading pair", async function() {
      // watch for 'NewPair' event
      const newPairEventPromise = new Promise<NewPair>((resolve, reject) => {
        semiDex.once("NewPair", function(pairId, tokenA, tokenB, rateAtoB) {
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
      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB
      );

      // retrieve NewPair event from result
      const newPairEvent = await newPairEventPromise;

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
      const pairsCountAfter = await semiDex.pairsCount();
      const pair = await semiDex.pairs(pairId);

      expect(pairsCountAfter).to.equal(initialPairsCount + 1);

      // expect stored pair info to be correct
      expect(testPair.tokenA).to.equal(pair.tokenA);
      expect(testPair.tokenB).to.equal(pair.tokenB);
      expect(testPair.rateAtoB).to.equal(pair.rateAtoB);
    });

    it("Should be able to update a trading pair details", async function() {
      const testPair = {
        tokenA: "ETH",
        tokenB: "USDC",
        rateAtoB: bigNumberify(185)
      };

      // add the new exchange pair
      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB
      );

      const pairId = 0;
      const pair = await semiDex.pairs(pairId);

      // check pair exists
      expect(pair).to.not.be.undefined;

      const updatedDetails = {
        balanceA: bigNumberify(1000),
        balanceB: bigNumberify(2000),
        rateAtoB: bigNumberify(200)
      };

      // run pair update
      await semiDex.updatePairDetails(
        pairId,
        updatedDetails.balanceA,
        updatedDetails.balanceB,
        updatedDetails.rateAtoB
      );

      const updatedPair: any = await semiDex.pairs(pairId);


      // expect pair details to be correctly updated
      const expectedUpdatedPairDetails = { ...testPair, ...updatedDetails };
      Object.entries(expectedUpdatedPairDetails).forEach(([key, value]) => {
        expect(updatedPair[key]).to.equal(value)
      })
    });
  });
});
