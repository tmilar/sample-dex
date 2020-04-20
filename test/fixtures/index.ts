import { Contract } from "ethers";

const tokensJson = require("./ethTokens.json");

export type Token = {
  address: string;
  symbol: string;
  decimal: number;
  type: string;
  name: string;

  contract: Contract;
};

const tokens = tokensJson as Token[];

export function getToken(symbol: string): Token {
  const token = tokens.find((token: Token) => token.symbol === symbol);
  if (token === undefined) {
    throw new Error(`not found token symbol '${symbol}'`);
  }
  token.name = token.name || symbol;
  return token;
}
