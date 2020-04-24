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
    // verify pair exists, and not removed
    require(pairId < pairsCount, "Pair id not exists in array");
    require(!isPairRemoved(pairId), "Pair has been removed");

    Pair memory pair = pairs[pairId];

    // determine tokens trade direction
    bool isReverse;

    if (fromToken == pair.tokenA) {
      isReverse = false;
    } else if (fromToken == pair.tokenB) {
      isReverse = true;
    } else {
      console.log("Error: specified token %s doesn't belong to pair id %d", fromToken, pairId);
      revert("Specified token doesn't belong to pair");
    }

    // execute trade among tokens of the pair (based on normal/reversed direction)
    _trade(pairId, inputCurrency, isReverse);
  }

  function _trade(uint pairId, uint256 inputCurrency, bool isReversed) private {
    Pair memory pair = pairs[pairId];

    // address of token contract RECEIVED from the client
    address inputToken;
    // address of token contract SENT to the client
    address outputToken;

    // contract reference of token that is RECEIVED from the client
    ERC20Detailed InputToken;
    // contract reference of token that is SENT to the client
    ERC20Detailed OutputToken;

    // contract pool, to deposit the input from the client
    address poolTokenTo;
    // contract pool, to extract the output for the client
    address poolTokenFrom;

    // currency amount to send to the client
    uint256 outputCurrency;

    if (!isReversed) {
      // regular trade: use tokenA as input, and tokenB as output
      inputToken = pair.tokenA;
      outputToken = pair.tokenB;

      poolTokenTo = pair.poolTokenA;
      poolTokenFrom = pair.poolTokenB;
    } else {
      // reversed trade: flip tokenA -> tokenB, and poolTokenA -> poolTokenB
      inputToken = pair.tokenB;
      outputToken = pair.tokenA;

      poolTokenTo = pair.poolTokenB;
      poolTokenFrom = pair.poolTokenA;
    }

    InputToken = ERC20Detailed(inputToken);
    OutputToken = ERC20Detailed(outputToken);

    // calculate outputCurrency amount (input * rate if normal, or input / rate if reversed)
    if (!isReversed) {
      outputCurrency = inputCurrency.mul(pair.rateAtoB);

      console.log("Trade in: %d %s (tokenA), at rateAtoB: %d", inputCurrency, InputToken.symbol(), pair.rateAtoB);
      console.log("=> Trade out: %d %s (tokenB)", outputCurrency, OutputToken.symbol());
    } else {
      outputCurrency = inputCurrency.div(pair.rateAtoB);

      console.log("Trade in: %d %s (tokenB), at rateAtoB (inverse): 1/%d", inputCurrency, InputToken.symbol(), pair.rateAtoB);
      console.log("=> Trade out: %d %s (tokenA)", outputCurrency, OutputToken.symbol());
    }

    uint256 initialBalancePoolTo = InputToken.balanceOf(poolTokenTo);
    uint256 initialBalancePoolFrom = OutputToken.balanceOf(poolTokenFrom);
    console.log("initialBalancePoolFrom %d, initialBalancePoolTo %d (reversed: %s)", initialBalancePoolFrom, initialBalancePoolTo, isReversed);

    // update pair balances
    require(initialBalancePoolFrom >= outputCurrency, "Not enough balance for output in contract pool from");
    require(InputToken.allowance(msg.sender, address(this)) >= inputCurrency, "Not enough allowance of client input tokenA (trade input))");
    require(OutputToken.allowance(poolTokenFrom, address(this)) >= outputCurrency, "Not enough allowance of contract output tokenB (trade output)");

    // transfer input currency from sender (client) to the pair token pool (contract)
    InputToken.transferFrom(msg.sender, poolTokenTo, inputCurrency);

    // transfer output currency from the pair token pool (contract) to the sender (client)
    OutputToken.transferFrom(poolTokenFrom, msg.sender, outputCurrency);

    console.log("Pair pool '%s' balance: %d -> %d (increased)", InputToken.symbol(), initialBalancePoolTo, InputToken.balanceOf(poolTokenTo));
    console.log("Pair pool '%s' balance: %d -> %d (decreased)", OutputToken.symbol(), initialBalancePoolFrom, OutputToken.balanceOf(poolTokenFrom));
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

  function isPairRemoved(uint pairId) view public returns (bool) {
    require(pairId < pairsCount, "Pair id not exists in array");
    Pair memory pair = pairs[pairId];

    return pair.tokenA == address(0) &&
    pair.tokenB == address(0) &&
    pair.rateAtoB == 0;
  }
}
