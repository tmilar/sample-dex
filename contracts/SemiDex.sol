pragma solidity >=0.5.0 <0.6.0;

import "@nomiclabs/buidler/console.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

import "./ownable.sol";
import "./safemath.sol";

contract SemiDex is Ownable {
  using SafeMath32 for uint32;

  struct Pair {
    address tokenA;
    address tokenB;

    uint256 rateAtoB;

    address poolTokenA;
    address poolTokenB;
  }

  Pair[] public pairs;
  uint32 public pairsCount;

  event NewPair (uint pairId, address tokenA, address tokenB, uint256 rateAtoB);

  // add a tokens exchange pair
  function addPair(address tokenA, address tokenB, uint256 rateAtoB, address poolTokenA, address poolTokenB) external onlyOwner {
    Pair memory pair = Pair(tokenA, tokenB, rateAtoB, poolTokenA, poolTokenB);
    uint pairId = pairs.push(pair) - 1;
    pairsCount = pairsCount.add(1);
    console.log("Added pair: %s/%s at rate %d", tokenA, tokenB, rateAtoB);
    console.log("New pairs count: %d", pairsCount);

    emit NewPair(pairId, tokenA, tokenB, rateAtoB);
  }

  function getPairDetails(uint pairId) view external returns (
    address tokenA,
    address tokenB,
    uint256 rateAtoB,
    uint256 balanceA,
    uint256 balanceB,
    string memory symbolA,
    string memory symbolB,
    uint8 decimalsA,
    uint8 decimalsB
  ){

    tokenA = pairs[pairId].tokenA;
    tokenB = pairs[pairId].tokenB;
    rateAtoB = pairs[pairId].rateAtoB;

    ERC20Detailed A = ERC20Detailed(tokenA);
    ERC20Detailed B = ERC20Detailed(tokenB);

    balanceA = A.balanceOf(pairs[pairId].poolTokenA);
    balanceB = B.balanceOf(pairs[pairId].poolTokenB);

    symbolA = A.symbol();
    symbolB = B.symbol();
    decimalsA = A.decimals();
    decimalsB = B.decimals();
  }

  function updatePairRateAtoB(uint pairId, uint256 rateAtoB) external onlyOwner {
    pairs[pairId].rateAtoB = rateAtoB;
  }

  /*
   * Remove a pair by "nullyfing" all of its values.
   * We still keep the position in the pairs array, to prevent invalid operations by rearranging the whole array.
   */
  function removePair(uint pairId) external onlyOwner {
    require(pairId < pairsCount, "Pair id not exists in array");
    Pair storage pair = pairs[pairId];
    pair.tokenA = address(0);
    pair.tokenB = address(0);
    pair.rateAtoB = 0;
  }

  function isPairRemoved(uint pairId) view external returns (bool) {
    require(pairId < pairsCount, "Pair id not exists in array");
    Pair memory pair = pairs[pairId];

    return pair.tokenA == address(0) &&
    pair.tokenB == address(0) &&
    pair.rateAtoB == 0;
  }
}
