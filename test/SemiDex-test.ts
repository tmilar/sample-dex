import { waffle } from "@nomiclabs/buidler";
import chai from "chai";
import { deployContract, solidity } from "ethereum-waffle";
import { BigNumber, bigNumberify } from "ethers/utils";

import { SemiDex } from "../typechain/SemiDex";
import SemiDexArtifact from "../artifacts/SemiDex.json";

import { getToken } from "./fixtures";

chai.use(solidity);
const { expect } = chai;

type Pair = {
  tokenA: string;
  tokenB: string;
  rateAtoB: BigNumber;
  balanceA: BigNumber;
  balanceB: BigNumber;
};

const tokensMap = {
  USDC: getToken("USDC"),
  BNB: getToken("BNB"),
  LINK: getToken("LINK (Chainlink)"),
  HT: getToken("HT"),
  MKR: getToken("MKR")
};

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("SemiDex", () => {
  const { provider } = waffle;
  const [adminWallet, userWallet] = provider.getWallets();

  let semiDex: SemiDex;

  beforeEach(async () => {
    semiDex = (await deployContract(adminWallet, SemiDexArtifact)) as SemiDex;
  });

  context("Admin", function() {

    it("Add a trading pair", async function() {
      const testPair = {
        tokenA: tokensMap.MKR.address,
        tokenB: tokensMap.HT.address,
        rateAtoB: bigNumberify(185)
      };

      const expectedPairId = 0;

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

      expect(pairsCountAfter).to.equal(1);

      // expect stored pair info to be correct
      expect(testPair.tokenA).to.equal(pair.tokenA);
      expect(testPair.tokenB).to.equal(pair.tokenB);
      expect(testPair.rateAtoB).to.equal(pair.rateAtoB);
    });

    it("Update an existing trading pair details", async function() {
      const testPair = {
        tokenA: tokensMap.MKR.address,
        tokenB: tokensMap.HT.address,
        rateAtoB: bigNumberify(185)
      };

      // add a sample exchange pair for updating
      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB
      );

      const pairId = (await semiDex.pairsCount()) - 1;
      const pair = await semiDex.pairs(pairId);

      // ensure pair exists
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

    it("Remove an existing trading pair", async function() {
      // add a sample pair for removal
      await semiDex.addPair(tokensMap.BNB.address, tokensMap.USDC.address, 1);

      const existingPairId = 0;
      const existingPair = await semiDex.pairs(existingPairId);
      // ensure a pair exists
      expect(existingPair).to.exist;

      // helper function to check pair removal
      function _isPairRemoved(pair: Pair) {
        const { tokenA, tokenB, rateAtoB, balanceA, balanceB } = pair;
        return (
          tokenA === NULL_ADDRESS &&
          tokenB === NULL_ADDRESS &&
          rateAtoB.toNumber() === 0 &&
          balanceA.toNumber() === 0 &&
          balanceB.toNumber() === 0
        );
      }

      expect(_isPairRemoved(existingPair)).to.be.false;
      expect(await semiDex.isPairRemoved(existingPairId)).to.be.false;
      // remove existing pair
      await semiDex.removePair(existingPairId);
      const removedPair = await semiDex.pairs(existingPairId);

      // expect pair to be removed
      expect(_isPairRemoved(removedPair)).to.be.true;
      expect(await semiDex.isPairRemoved(existingPairId)).to.be.true;
    });
  });

  context("User", function() {
    let semiDexAsUser: SemiDex;

    beforeEach(async () => {
      semiDexAsUser = semiDex.connect(userWallet);
    });

    it("List all existing pairs", async () => {
      const testPairs = [
        {
          tokenA: tokensMap.USDC.address,
          tokenB: tokensMap.BNB.address
        },
        {
          tokenA: tokensMap.HT.address,
          tokenB: tokensMap.LINK.address
        }
      ];

      for (let { tokenA, tokenB } of testPairs) {
        await semiDex.addPair(tokenA, tokenB, bigNumberify(1));
      }

      // ensure that more than 1 pair is available
      const pairsCount = await semiDexAsUser.pairsCount();
      expect(pairsCount).to.be.equal(testPairs.length);

      // retrieve all pairs
      const pairs = await Promise.all(
        [...Array(pairsCount)].map(async (_, pairId) => ({
          pairId,
          ...(await semiDexAsUser.pairs(pairId))
        }))
      );

      expect(pairs.length).to.equal(pairsCount);
      expect(pairs[0]).to.include(testPairs[0]);
      expect(pairs[1]).to.include(testPairs[1]);
    });

    it("Can't add a new pair", async () => {
      const addPairTransactionPromise = semiDexAsUser.addPair(
        tokensMap.USDC.address,
        tokensMap.BNB.address,
        bigNumberify(100)
      );

      await expect(addPairTransactionPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });

    it("Can't modify an existing pair", async () => {
      await semiDex.addPair(
        tokensMap.USDC.address,
        tokensMap.BNB.address,
        bigNumberify(100)
      );
      const existingPairId = 0;
      // ensure that 1 pair exists
      const pairsCount = await semiDexAsUser.pairsCount();
      expect(pairsCount).to.be.equal(1);

      const updatePairPromise = semiDexAsUser.updatePairDetails(
        existingPairId,
        bigNumberify(0),
        bigNumberify(0),
        bigNumberify(0)
      );

      // expect update transaction to revert
      await expect(updatePairPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });

    it("Can't remove an existing pair", async () => {
      await semiDex.addPair(
        tokensMap.USDC.address,
        tokensMap.BNB.address,
        bigNumberify(100)
      );
      const existingPairId = 0;
      // ensure that 1 pair exists
      const pairsCount = await semiDexAsUser.pairsCount();
      expect(pairsCount).to.be.equal(1);

      // expect removePair transaction to revert
      const removePairPromise = semiDexAsUser.removePair(existingPairId);
      await expect(removePairPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });
  });
});
