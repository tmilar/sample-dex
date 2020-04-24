import { waffle, ethers } from "@nomiclabs/buidler";
import chai from "chai";
import { deployContract, solidity } from "ethereum-waffle";
import { BigNumber, bigNumberify } from "ethers/utils";
import { Wallet } from "ethers";

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

type PairFixture = {
  tokenA: ERC20DetailedMock;
  tokenB: ERC20DetailedMock;
  rateAtoB: BigNumber;
  poolTokenA: string;
  poolTokenB: string;
};

const tokensMap = {
  USDC: getToken("USDC"),
  BNB: getToken("BNB"),
  HT: getToken("HT"),
  MKR: getToken("MKR")
};

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const UINT256_MAX = bigNumberify(2)
  .pow(256)
  .sub(1);

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

  let testPair: PairFixture;

  // helper function to transfer erc20 token currency, in tests
  async function transferAndVerify(
    erc20Token: ERC20DetailedMock | string, // deployed Contract instance, or its address
    to: string | Wallet,
    amount: BigNumber,
    signer?: Wallet
  ) {
    if (to instanceof Wallet) {
      to = to.address;
    }
    expect(to).to.be.properAddress;

    // if erc20Token reference is the contract address, retrieve the deployed instance.
    if (typeof erc20Token === "string") {
      expect(erc20Token).to.be.properAddress;
      erc20Token = (await ethers.getContractAt(
        ERC20DetailedMockArtifact.contractName,
        erc20Token
      )) as ERC20DetailedMock;
    }

    const erc20TokenContract =
      signer !== undefined ? erc20Token.connect(signer) : erc20Token;

    if (signer) {
      expect(await erc20TokenContract.balanceOf(signer.address)).to.be.gte(
        amount
      );
    }
    await erc20TokenContract.transfer(to, amount);
    expect(await erc20TokenContract.balanceOf(to)).to.be.equal(amount);
  }

  beforeEach(async () => {
    // deploy SemiDex instance
    semiDex = (await deployContract(adminWallet, SemiDexArtifact)) as SemiDex;

    const initialHolder = erc20Owner.address;
    const initialSupply = bigNumberify(20000);
    const initialAdminBalance = bigNumberify(10000);
    const initialUserBalance = bigNumberify(1000);

    // deploy ERC20 token contract mocks & initialize balances
    for (const [name, token] of Object.entries(tokensMap)) {
      // deploy erc20 token instance
      token.contract = await deployContract(
        erc20Owner,
        ERC20DetailedMockArtifact,
        [name, token.symbol, token.decimal, initialHolder, initialSupply]
      );

      // initialize admin & user balances
      const erc20Token = token.contract as ERC20DetailedMock;

      // transfer token balances to test accounts
      await transferAndVerify(erc20Token, adminWallet, initialAdminBalance);
      await transferAndVerify(erc20Token, userWallet, initialUserBalance);

      // give infinite approval from pool wallets to semiDex contract
      await erc20Token
        .connect(poolTokenWallet1)
        .approve(semiDex.address, UINT256_MAX);
      await erc20Token
        .connect(poolTokenWallet2)
        .approve(semiDex.address, UINT256_MAX);
    }

    // define fixture testPair object
    testPair = {
      tokenA: tokensMap.BNB.contract as ERC20DetailedMock,
      tokenB: tokensMap.USDC.contract as ERC20DetailedMock,
      rateAtoB: bigNumberify(15),
      poolTokenA: poolTokenWallet1.address,
      poolTokenB: poolTokenWallet2.address
    };
  });

  context("Admin", function() {
    it("Add a trading pair", async function() {
      const expectedPairId = 0;

      // add the new exchange pair
      const addPairPromise = semiDex.addPair(
        testPair.tokenA.address,
        testPair.tokenB.address,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      // add pair, and expect NewPair event
      await expect(addPairPromise)
        .to.emit(semiDex, "NewPair")
        .withArgs(
          expectedPairId,
          testPair.tokenA.address,
          testPair.tokenB.address,
          testPair.rateAtoB
        );

      // expect pair to be stored in contract pairs array
      const pairsCountAfter = await semiDex.pairsCount();
      const pair = await semiDex.pairs(expectedPairId);

      expect(pairsCountAfter).to.equal(1);

      // expect stored pair info to be correct
      expect(testPair.tokenA.address).to.equal(pair.tokenA);
      expect(testPair.tokenB.address).to.equal(pair.tokenB);
      expect(testPair.rateAtoB).to.equal(pair.rateAtoB);
    });

    it("Update an existing trading pair rateAtoB", async function() {
      // add a sample exchange pair for updating
      await semiDex.addPair(
        testPair.tokenA.address,
        testPair.tokenB.address,
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
      expect(updatedPair.rateAtoB).to.equal(updatedDetails.rateAtoB);
    });

    it("Provide liquidity to an existing trading pair", async function() {
      // add a sample pair to be updated
      await semiDex.addPair(
        testPair.tokenA.address,
        testPair.tokenB.address,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      const pairId = 0;
      const pair = await semiDex.getPairDetails(pairId);

      // ensure pair exists
      expect(pair).to.exist;

      // get initial balances
      const {
        balanceA: initialBalanceA,
        balanceB: initialBalanceB
      } = await semiDex.getPairDetails(pairId);

      // transfer currency to pair pools
      const amount = bigNumberify(100);
      await transferAndVerify(
        testPair.tokenA,
        testPair.poolTokenA,
        amount,
        adminWallet
      );
      await transferAndVerify(
        testPair.tokenB,
        testPair.poolTokenB,
        amount,
        adminWallet
      );

      // expect pair details to now include updated token balances
      const { balanceA, balanceB } = await semiDex.getPairDetails(pairId);

      expect(balanceA).to.be.equal(initialBalanceA.add(amount));
      expect(balanceB).to.be.equal(initialBalanceB.add(amount));
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
        testPair.tokenA.address,
        testPair.tokenB.address,
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
          tokenB: tokensMap.MKR.contract.address,

          symbolA: tokensMap.HT.symbol,
          symbolB: tokensMap.MKR.symbol,
          decimalsA: tokensMap.HT.decimal,
          decimalsB: tokensMap.MKR.decimal
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

    it("Can trade tokenA of a pair and receive expected tokenB of same pair", async () => {
      // ensure a pair exists
      const existingPairId = 0;
      await semiDex.addPair(
        testPair.tokenA.address,
        testPair.tokenB.address,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      const { tokenB, poolTokenB, rateAtoB } = await semiDexAsUser.pairs(
        existingPairId
      );

      // initialize pair balance
      const initialBalanceTokenB = bigNumberify(5000);

      // transfer balance from adminWallet to the pool of the pair's tokenB (output)
      await transferAndVerify(
        tokenB,
        poolTokenB,
        initialBalanceTokenB,
        adminWallet
      );

      const {
        balanceA: pairTokenABalanceBefore,
        balanceB: pairTokenBBalanceBefore
      } = await semiDexAsUser.getPairDetails(existingPairId);

      // trade input
      const inputTokenA = bigNumberify(50); // ie. 1 ETH at 100 ETH/USDC -> expect 1/100 USDC output
      const expectedOutputTokenB = rateAtoB.mul(inputTokenA);

      // assert user balance
      const userTokenABalanceBefore = await testPair.tokenA.balanceOf(
        userWallet.address
      );
      const userTokenBBalanceBefore = await testPair.tokenB.balanceOf(
        userWallet.address
      );
      expect(userTokenABalanceBefore).to.be.gte(inputTokenA);

      // execute trade:
      // client approves input tokenA to semiDex & expects output of tokenB received
      await testPair.tokenA
        .connect(userWallet)
        .approve(semiDex.address, inputTokenA);

      await semiDexAsUser.trade(
        existingPairId,
        testPair.tokenA.address,
        inputTokenA
      );

      // expect user balance to be -input of tokenA
      expect(await testPair.tokenA.balanceOf(userWallet.address)).to.be.equal(
        userTokenABalanceBefore.sub(inputTokenA)
      );

      // expect user balance to be +output of tokenB
      expect(await testPair.tokenB.balanceOf(userWallet.address)).to.be.equal(
        userTokenBBalanceBefore.add(expectedOutputTokenB)
      );

      // expect contract pair balances to be updated correctly
      const {
        balanceA: pairTokenABalanceAfter,
        balanceB: pairTokenBBalanceAfter
      } = await semiDexAsUser.getPairDetails(existingPairId);

      // expect contract balanceA to be +input of tokenA
      expect(pairTokenABalanceAfter).to.be.equal(
        pairTokenABalanceBefore.add(inputTokenA)
      );

      // expect contract balanceB to be -output of tokenB
      expect(pairTokenBBalanceAfter).to.be.equal(
        pairTokenBBalanceBefore.sub(expectedOutputTokenB)
      );
    });

    it("Can trade tokenB of a pair and receive expected tokenA of same pair (reverse operation)", async () => {
      // ensure a pair exists
      const existingPairId = 0;
      await semiDex.addPair(
        testPair.tokenA.address,
        testPair.tokenB.address,
        testPair.rateAtoB,
        testPair.poolTokenA,
        testPair.poolTokenB
      );

      const { tokenA, poolTokenA, rateAtoB } = await semiDexAsUser.pairs(
        existingPairId
      );

      // initialize pair balance
      const initialBalanceTokenA = bigNumberify(5000);

      // transfer balance from adminWallet to the pool of the pair's tokenB (output)
      await transferAndVerify(
        tokenA,
        poolTokenA,
        initialBalanceTokenA,
        adminWallet
      );

      const {
        balanceA: pairTokenABalanceBefore,
        balanceB: pairTokenBBalanceBefore
      } = await semiDexAsUser.getPairDetails(existingPairId);

      // trade input
      const inputTokenB = bigNumberify(50); // ie. 1 ETH at 100 ETH/USDC -> expect 1/100 USDC output
      const expectedOutputTokenA = inputTokenB.div(rateAtoB);

      // assert user balance
      const userTokenABalanceBefore = await testPair.tokenA.balanceOf(
        userWallet.address
      );
      const userTokenBBalanceBefore = await testPair.tokenB.balanceOf(
        userWallet.address
      );
      expect(userTokenABalanceBefore).to.be.gte(inputTokenB);

      // run trade:
      // client approves inputTokenB to semiDex
      await testPair.tokenB
        .connect(userWallet)
        .approve(semiDex.address, inputTokenB);
      // client executes trade() and expects expectedOutputTokenA received
      await semiDexAsUser.trade(
        existingPairId,
        testPair.tokenB.address,
        inputTokenB
      );

      // expect user balance to be -input of tokenB
      expect(await testPair.tokenB.balanceOf(userWallet.address)).to.be.equal(
        userTokenBBalanceBefore.sub(inputTokenB)
      );

      // expect user balance to be +output of tokenA
      expect(await testPair.tokenA.balanceOf(userWallet.address)).to.be.equal(
        userTokenABalanceBefore.add(expectedOutputTokenA)
      );

      // expect contract pair balances to be updated correctly
      const {
        balanceA: pairTokenABalanceAfter,
        balanceB: pairTokenBBalanceAfter
      } = await semiDexAsUser.getPairDetails(existingPairId);

      // expect contract balanceB to be +input of tokenB
      expect(pairTokenBBalanceAfter).to.be.equal(
        pairTokenBBalanceBefore.add(inputTokenB)
      );

      // expect contract balanceA to be -output of tokenA
      expect(pairTokenABalanceAfter).to.be.equal(
        pairTokenABalanceBefore.sub(expectedOutputTokenA)
      );
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
