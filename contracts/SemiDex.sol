pragma solidity >=0.5.0 <0.6.0;

import "@nomiclabs/buidler/console.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

import "./ownable.sol";
import "./safemath.sol";

contract SemiDex is Ownable {
  using SafeMath32 for uint32;
  using SafeMath256 for uint256;

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

  function trade(uint pairId, address fromToken, uint256 inputCurrency) external {
    // verify pair exists
    require(pairId < pairsCount, "Pair id not exists in array");
    require(!isPairRemoved(pairId), "Pair has been removed");

    Pair storage pair = pairs[pairId];

    address tokenA;
    address tokenB;
    uint rateAtoB;

    bool isReverse;

    // determine tokens trade direction
    if (fromToken == pair.tokenA) {
      // trade is A->B: out = in . rateAtoB
      tokenA = fromToken;
      tokenB = pair.tokenB;
      rateAtoB = pair.rateAtoB;
      isReverse = false;
    } else if (fromToken == pair.tokenB) {
      // trade is B->A: out = in . (1 / rateAtoB)
      tokenA = pair.tokenB;
      tokenB = fromToken;
      rateAtoB = 1 / pair.rateAtoB;
      isReverse = true;
    } else {
      console.log("Error: specified token %s doesn't belong to pair id %d", fromToken, pairId);
      revert("Specified token %s doesn't belong to pair");
    }

    // calculate output currency to send to client based on input & rate
    uint256 outputCurrency = inputCurrency.mul(rateAtoB);

    // retrieve tokens detailed info
    ERC20Detailed A = ERC20Detailed(tokenA);
    ERC20Detailed B = ERC20Detailed(tokenB);

    console.log("Trade in: %d %s, at rateAtoB: %d", inputCurrency, A.symbol(), rateAtoB);
    console.log("=> Trade out: %d %s", outputCurrency, B.symbol());

    uint256 initialBalanceA = A.balanceOf(pair.poolTokenA);
    uint256 initialBalanceB = B.balanceOf(pair.poolTokenB);
    console.log("pool initialBalanceA %d, pool initialBalanceB %d", initialBalanceA, initialBalanceB);

    // update pair balances
    if (!isReverse) {
      // client in: tokenA -> pool => pool out: tokenB -> client
      require(initialBalanceB >= outputCurrency, "Not enough balance in pool of output tokenB");
      require(A.allowance(msg.sender, address(this)) >= inputCurrency, "Not enough allowance of client input tokenA");
      require(B.allowance(pair.poolTokenB, address(this)) >= outputCurrency, "Not enough allowance of contract output tokenB");

      A.transferFrom(msg.sender, pair.poolTokenA, inputCurrency);
      B.transferFrom(pair.poolTokenB, msg.sender, outputCurrency);
    } else {
      // client in: tokenB -> pool, pool out: tokenA -> client
      // TODO implement
      revert("reverse trade not yet implemented");
    }

    console.log("Pair pool '%s' balanceA %d -> %d", A.symbol(), initialBalanceA, A.balanceOf(pair.poolTokenA));
    console.log("Pair pool '%s' balanceB %d -> %d", B.symbol(), initialBalanceB, B.balanceOf(pair.poolTokenB));
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
