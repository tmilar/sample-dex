pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

contract ERC20DetailedMock is ERC20, ERC20Detailed {
  constructor (
    string memory name, string memory symbol, uint8 decimals, address initialAccount, uint256 initialBalance
  ) public ERC20Detailed(name, symbol, decimals) {
    // solhint-disable-previous-line no-empty-blocks
    super._mint(initialAccount, initialBalance);
  }
}
