pragma solidity >=0.5.0 <0.6.0;

import "@nomiclabs/buidler/console.sol";

import "./ownable.sol";
import "./safemath.sol";

contract SemiDex is Ownable {
  using SafeMath32 for uint32;

  struct Pair {
    string tokenA;
    string tokenB;

    uint256 rateAtoB;

    uint128 balanceA;
    uint128 balanceB;
  }

  Pair[] public pairs;
  uint32 public pairsCount;

  event NewPair (uint pairId, string tokenA, string tokenB, uint256 rateAtoB);

  // add a tokens exchange pair
  function addPair(string calldata tokenA, string calldata tokenB, uint256 rateAtoB) external onlyOwner {
    Pair memory pair = Pair(tokenA, tokenB, rateAtoB, 0, 0);
    uint pairId = pairs.push(pair) - 1;
    pairsCount = pairsCount.add(1);
    console.log("Added pair: %s/%s at rate %d", tokenA, tokenB, rateAtoB);
    console.log("New pairs count: %d", pairsCount);

    emit NewPair(pairId, tokenA, tokenB, rateAtoB);
  }

  function updatePairDetails(uint pairId, uint128 balanceA, uint128 balanceB, uint256 rateAtoB) external onlyOwner {
    pairs[pairId].balanceA = balanceA;
    pairs[pairId].balanceB = balanceB;
    pairs[pairId].rateAtoB = rateAtoB;
  }
}
