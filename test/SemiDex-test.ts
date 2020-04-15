import { waffle } from "@nomiclabs/buidler";
import chai from "chai";
import { solidity, deployContract } from "ethereum-waffle";

chai.use(solidity);

const { expect } = chai;

import SemiDexArtifact from "../artifacts/SemiDex.json";
import { SemiDex } from "../typechain/SemiDex";
import { bigNumberify } from "ethers/utils";

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
      const testPair = {
        tokenA: "ETH",
        tokenB: "USDC",
        rateAtoB: bigNumberify(185)
      };

      const expectedPairId = bigNumberify(initialPairsCount);

      // add the new exchange pair
      const addPairPromise = semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB
      );

      // add pair, and expect NewPair event
      await expect(addPairPromise)
        .to.emit(semiDex, "NewPair")
        .withArgs(
          expectedPairId,
          testPair.tokenA,
          testPair.tokenB,
          testPair.rateAtoB
        );

      // expect pair to be stored in contract pairs array
      const pairsCountAfter = await semiDex.pairsCount();
      const pair = await semiDex.pairs(expectedPairId);

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
        expect(updatedPair[key]).to.equal(value);
      });
    });
  });
});
