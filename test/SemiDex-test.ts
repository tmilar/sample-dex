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
  const [adminWallet, userWallet] = provider.getWallets();

  context("Admin", function() {
    let semiDex: SemiDex;
    let initialPairsCount: number;

    beforeEach(async () => {
      semiDex = (await deployContract(adminWallet, SemiDexArtifact)) as SemiDex;

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

  context("User", function() {
    let semiDex: SemiDex;
    let semiDexAsUser: SemiDex;

    beforeEach(async () => {
      semiDex = (await deployContract(adminWallet, SemiDexArtifact)) as SemiDex;
      await semiDex.addPair("A", "B", bigNumberify(1));
      semiDexAsUser = semiDex.connect(userWallet);
    });

    it("Can't add a new pair", async () => {
      const addPairTransactionPromise = semiDexAsUser.addPair(
        "A",
        "B",
        bigNumberify(100)
      );
      await expect(addPairTransactionPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });

    it("Can't modify an existing pair", async () => {
      const existingPairId = 0;
      const pair = await semiDexAsUser.pairs(existingPairId);
      expect(pair).to.exist;
      const updatePairPromise = semiDexAsUser.updatePairDetails(
        existingPairId,
        bigNumberify(0),
        bigNumberify(0),
        bigNumberify(0)
      );

      await expect(updatePairPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });
  });
});
