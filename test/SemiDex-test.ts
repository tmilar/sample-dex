import { artifacts, contract } from "@nomiclabs/buidler";
import { assert } from "chai";

const BN = require("bn.js");

const SemiDex = artifacts.require("SemiDex");

contract("SemiDex", accounts => {
  context("Admin", function() {
    it("Should be able to add a trading pair", async function() {
      const semiDex = await SemiDex.new();
      const pairsCountBefore = await semiDex.pairsCount();
      assert.equal(pairsCountBefore, 0);

      // add trading pair
      const testPair = { tokenA: "ETH", tokenB: "USDC", rateAtoB: new BN(185) };
      const result = await semiDex.addPair(testPair.tokenA, testPair.tokenB, testPair.rateAtoB);

      // retrieve NewPair event from result
      const newPairEvent = result.logs.find(
        (log: any) => log.event === "NewPair"
      );

      if (newPairEvent === undefined) {
        assert.fail(newPairEvent, { event: "NewPair" }, "No new pair event");
        return;
      }

      // expect NewPair event info to be correct
      const { pairId, tokenA, tokenB, rateAtoB } = newPairEvent.args;
      assert.equal(testPair.tokenA, tokenA);
      assert.equal(testPair.tokenB, tokenB);
      assert.equal(testPair.rateAtoB.toString(), rateAtoB.toString());

      // expect pair to be stored in contract pairs array
      const pairsCountAfter = await semiDex.pairsCount();
      const pair = await semiDex.pairs(pairId.toNumber());

      assert.equal(pairsCountAfter, 1);

      // expect stored pair info to be correct
      assert.equal(testPair.tokenA, pair.tokenA);
      assert.equal(testPair.tokenB, pair.tokenB);
      assert.equal(new BN(testPair.rateAtoB).toString(), pair.rateAtoB.toString());
    });
  });
});
