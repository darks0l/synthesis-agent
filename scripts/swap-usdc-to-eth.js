#!/usr/bin/env node
// Swap USDC → WETH → unwrap to ETH for gas
import { ethers } from 'ethers';
import { config } from '../src/config.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8');
const match = raw.match(/DEPLOYER_KEY=(0x[a-fA-F0-9]+)/);
const pk = match ? match[1] : raw.trim();

const provider = new ethers.JsonRpcProvider(config.chain.rpc);
const wallet = new ethers.Wallet(pk, provider);

const USDC = config.tokens.USDC;
const WETH = config.tokens.WETH;
const ROUTER = config.uniswap.routerV3;

const SWAP_AMOUNT = ethers.parseUnits('5', 6); // Swap 5 USDC → ETH (keep ~6 USDC for trading)

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

const WETH_ABI = [
  'function withdraw(uint256 wad) external',
  'function balanceOf(address) external view returns (uint256)',
];

async function main() {
  console.log(`Wallet: ${wallet.address}`);
  
  const ethBefore = await provider.getBalance(wallet.address);
  console.log(`ETH balance: ${ethers.formatEther(ethBefore)}`);
  
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const usdcBal = await usdc.balanceOf(wallet.address);
  console.log(`USDC balance: ${ethers.formatUnits(usdcBal, 6)}`);
  
  if (usdcBal < SWAP_AMOUNT) {
    console.log(`Not enough USDC. Have ${ethers.formatUnits(usdcBal, 6)}, need ${ethers.formatUnits(SWAP_AMOUNT, 6)}`);
    process.exit(1);
  }

  // 1. Approve USDC to router
  const allowance = await usdc.allowance(wallet.address, ROUTER);
  if (allowance < SWAP_AMOUNT) {
    console.log('Approving USDC...');
    const approveTx = await usdc.approve(ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    console.log(`Approved: ${approveTx.hash}`);
  }

  // 2. Swap USDC → WETH
  const router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
  console.log(`Swapping ${ethers.formatUnits(SWAP_AMOUNT, 6)} USDC → WETH...`);
  
  const swapTx = await router.exactInputSingle({
    tokenIn: USDC,
    tokenOut: WETH,
    fee: 500, // 0.05% pool (tightest spread)
    recipient: wallet.address,
    amountIn: SWAP_AMOUNT,
    amountOutMinimum: 1n,
    sqrtPriceLimitX96: 0n,
  });
  const receipt = await swapTx.wait();
  console.log(`Swap TX: ${swapTx.hash}`);

  // 3. Unwrap WETH → ETH
  const weth = new ethers.Contract(WETH, WETH_ABI, wallet);
  const wethBal = await weth.balanceOf(wallet.address);
  console.log(`WETH received: ${ethers.formatEther(wethBal)}`);
  
  if (wethBal > 0n) {
    console.log('Unwrapping WETH → ETH...');
    const unwrapTx = await weth.withdraw(wethBal);
    await unwrapTx.wait();
    console.log(`Unwrap TX: ${unwrapTx.hash}`);
  }

  // Final balances
  const ethAfter = await provider.getBalance(wallet.address);
  const usdcAfter = await usdc.balanceOf(wallet.address);
  console.log(`\n✅ Done!`);
  console.log(`ETH: ${ethers.formatEther(ethAfter)}`);
  console.log(`USDC: ${ethers.formatUnits(usdcAfter, 6)}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
