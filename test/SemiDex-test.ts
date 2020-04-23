import { waffle } from "@nomiclabs/buidler";
import chai from "chai";
import { deployContract, solidity } from "ethereum-waffle";
import { BigNumber, bigNumberify } from "ethers/utils";

import { SemiDex } from "../typechain/SemiDex";
import SemiDexArtifact from "../artifacts/SemiDex.json";

import { ERC20DetailedMock } from "../typechain/ERC20DetailedMock";
import ERC20DetailedMockArtifact from "../artifacts/ERC20DetailedMock.json";

import { getToken } from "./fixtures";

chai.use(solidity);
const { expect } = chai;

type Pair = {
  tokenA: string;
  tokenB: string;
  rateAtoB: BigNumber;
  poolTokenA: string;
  poolTokenB: string;
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
  const [
    adminWallet,
    userWallet,
    erc20Owner,
    poolTokenWallet1,
    poolTokenWallet2
  ] = provider.getWallets();

  let semiDex: SemiDex;

  beforeEach(async () => {
    // deploy SemiDex instance
    semiDex = (await deployContract(adminWallet, SemiDexArtifact)) as SemiDex;

    // deploy ERC20 token contract mocks
    for (const [name, token] of Object.entries(tokensMap)) {
      token.contract = (await deployContract(
        erc20Owner,
        ERC20DetailedMockArtifact,
        [name, token.symbol, token.decimal]
      )) as ERC20DetailedMock;
    }
  });

  context("Admin", function() {
    it("Add a trading pair", async function() {
      const testPair = {
        tokenA: tokensMap.USDC.contract.address,
        tokenB: tokensMap.BNB.contract.address,
        rateAtoB: bigNumberify(185),
        poolTokenA: poolTokenWallet1.address,
        poolTokenB: poolTokenWallet2.address
      };

      const expectedPairId = 0;

      // add the new exchange pair
      const addPairPromise = semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
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

    it("Update an existing trading pair rateAtoB ", async function() {
      const testPair = {
        tokenA: tokensMap.MKR.contract.address,
        tokenB: tokensMap.HT.contract.address,
        rateAtoB: bigNumberify(185),
        poolTokenA: poolTokenWallet1.address,
        poolTokenB: poolTokenWallet2.address
      };

      // add a sample exchange pair for updating
      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      const pairId = (await semiDex.pairsCount()) - 1;
      const pair = await semiDex.pairs(pairId);

      // ensure pair exists
      expect(pair).to.not.be.undefined;

      const updatedDetails = {
        rateAtoB: bigNumberify(200)
      };

      // run pair update
      await semiDex.updatePairRateAtoB(pairId, updatedDetails.rateAtoB);

      const updatedPair: any = await semiDex.pairs(pairId);

      // expect pair details to be correctly updated
      const expectedUpdatedPairDetails = { ...testPair, ...updatedDetails };
      Object.entries(expectedUpdatedPairDetails).forEach(([key, value]) => {
        expect(updatedPair[key]).to.equal(value);
      });
    });

    it("Remove an existing trading pair", async function() {
      // add a sample pair for removal
      await semiDex.addPair(
        tokensMap.BNB.contract.address,
        tokensMap.USDC.contract.address,
        1,
        poolTokenWallet1.address,
        poolTokenWallet2.address
      );

      const existingPairId = 0;
      const existingPair = await semiDex.pairs(existingPairId);
      // ensure a pair exists
      expect(existingPair).to.exist;

      // helper function to check pair removal
      function _isPairRemoved(pair: Pair) {
        const { tokenA, tokenB, rateAtoB } = pair;
        return (
          tokenA === NULL_ADDRESS &&
          tokenB === NULL_ADDRESS &&
          rateAtoB.toNumber() === 0
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

    it("Get an existing pair details", async () => {
      const testPair = {
        tokenA: tokensMap.BNB.contract.address,
        tokenB: tokensMap.USDC.contract.address,
        rateAtoB: bigNumberify(185),
        poolTokenA: poolTokenWallet1.address,
        poolTokenB: poolTokenWallet2.address
      };

      const expectedPairDetails = {
        tokenA: tokensMap.BNB.contract.address,
        tokenB: tokensMap.USDC.contract.address,
        symbolA: tokensMap.BNB.symbol,
        symbolB: tokensMap.USDC.symbol,
        decimalsA: tokensMap.BNB.decimal,
        decimalsB: tokensMap.USDC.decimal,
        rateAtoB: testPair.rateAtoB,
        balanceA: bigNumberify(0),
        balanceB: bigNumberify(0)
      };

      await semiDex.addPair(
        testPair.tokenA,
        testPair.tokenB,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      const existingPairId = 0;

      const pairDetails = await semiDexAsUser.getPairDetails(existingPairId);

      expect(pairDetails).to.exist;

      // keep only named props from pairDetails response,
      // remove redundant number-indexed props for easier test assertion
      const curatedPairDetails = Object.entries(pairDetails)
        .filter(([key]) => isNaN(Number(key)))
        .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});

      expect(curatedPairDetails).to.deep.equal(expectedPairDetails);
    });

    it("List all existing pairs", async () => {
      const testPairs = [
        {
          tokenA: tokensMap.USDC.contract.address,
          tokenB: tokensMap.BNB.contract.address,

          symbolA: tokensMap.USDC.symbol,
          symbolB: tokensMap.BNB.symbol,
          decimalsA: tokensMap.USDC.decimal,
          decimalsB: tokensMap.BNB.decimal
        },
        {
          tokenA: tokensMap.HT.contract.address,
          tokenB: tokensMap.LINK.contract.address,

          symbolA: tokensMap.HT.symbol,
          symbolB: tokensMap.LINK.symbol,
          decimalsA: tokensMap.HT.decimal,
          decimalsB: tokensMap.LINK.decimal
        }
      ];

      for (let { tokenA, tokenB } of testPairs) {
        await semiDex.addPair(
          tokenA,
          tokenB,
          bigNumberify(1),
          poolTokenWallet1.address,
          poolTokenWallet2.address
        );
      }

      // ensure that more than 1 pair is available
      const pairsCount = await semiDexAsUser.pairsCount();
      expect(pairsCount).to.be.equal(testPairs.length);

      // retrieve all pairs
      const pairs = await Promise.all(
        [...Array(pairsCount)].map(async (_, pairId) => ({
          pairId,
          ...(await semiDexAsUser.getPairDetails(pairId))
        }))
      );

      expect(pairs.length).to.equal(pairsCount);
      expect(pairs[0]).to.include(testPairs[0]);
      expect(pairs[1]).to.include(testPairs[1]);
    });

    it("Can't add a new pair", async () => {
      const addPairTransactionPromise = semiDexAsUser.addPair(
        tokensMap.USDC.contract.address,
        tokensMap.BNB.contract.address,
        bigNumberify(100),
        NULL_ADDRESS,
        NULL_ADDRESS
      );

      await expect(addPairTransactionPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });

    it("Can't modify an existing pair", async () => {
      await semiDex.addPair(
        tokensMap.USDC.contract.address,
        tokensMap.BNB.contract.address,
        bigNumberify(100),
        NULL_ADDRESS,
        NULL_ADDRESS
      );
      const existingPairId = 0;
      // ensure that 1 pair exists
      const pairsCount = await semiDexAsUser.pairsCount();
      expect(pairsCount).to.be.equal(1);

      const updatePairPromise = semiDexAsUser.updatePairRateAtoB(
        existingPairId,
        bigNumberify(0)
      );

      // expect update transaction to revert
      await expect(updatePairPromise).to.be.revertedWith(
        "Not allowed, only owner"
      );
    });

    it("Can't remove an existing pair", async () => {
      await semiDex.addPair(
        tokensMap.USDC.contract.address,
        tokensMap.BNB.contract.address,
        bigNumberify(100),
        NULL_ADDRESS,
        NULL_ADDRESS
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
