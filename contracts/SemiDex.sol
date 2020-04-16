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

  /*
   * Remove a pair by "nullyfing" all of its values.
   * We still keep the position in the pairs array, to prevent invalid operations by rearranging the whole array.
   */
  function removePair(uint pairId) external onlyOwner {
    require(pairId < pairsCount, "Pair id not exists in array");
    Pair storage pair = pairs[pairId];
    pair.tokenA = "";
    pair.tokenB = "";
    pair.rateAtoB = 0;
    pair.balanceA = 0;
    pair.balanceB = 0;
  }

  function isPairRemoved(uint pairId) view external returns (bool) {
    require(pairId < pairsCount, "Pair id not exists in array");
    Pair memory pair = pairs[pairId];

    return keccak256(abi.encodePacked(pair.tokenA)) == keccak256(abi.encodePacked("")) &&
    keccak256(abi.encodePacked(pair.tokenB)) == keccak256(abi.encodePacked("")) &&
    pair.rateAtoB == 0 &&
    pair.balanceA == 0 &&
    pair.balanceB == 0;
  }
}
