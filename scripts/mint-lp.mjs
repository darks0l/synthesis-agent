import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Connect
let rpc;
for (const url of ['https://mainnet.base.org', 'https://base-mainnet.public.blastapi.io', 'https://base.llamarpc.com']) {
  try { const p = new ethers.JsonRpcProvider(url); await p.getBlockNumber(); rpc = p; console.log('RPC:', url); break; } catch { continue; }
}
if (!rpc) throw new Error('All RPCs failed');

const raw = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8');
const match = raw.match(/(?:DEPLOYER_KEY=)?(0x[a-fA-F0-9]{64})/);
const wallet = new ethers.Wallet(match[1], rpc);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const NFPM = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const POOL_FEE = 500;

const erc20Abi = ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'];
const usdc = new ethers.Contract(USDC, erc20Abi, wallet);
const weth = new ethers.Contract(WETH, erc20Abi, wallet);

async function main() {
  const wethBal = await weth.balanceOf(wallet.address);
  const usdcBal = await usdc.balanceOf(wallet.address);
  const ethBal = await rpc.getBalance(wallet.address);
  console.log(`Balances: ETH=${ethers.formatEther(ethBal)}, WETH=${ethers.formatUnits(wethBal, 18)}, USDC=${ethers.formatUnits(usdcBal, 6)}`);

  if (wethBal === 0n) { console.log('No WETH to LP with!'); return; }

  // Approve NFPM
  let nonce = await rpc.getTransactionCount(wallet.address);
  
  const wethAllowance = await weth.allowance(wallet.address, NFPM);
  if (wethAllowance < wethBal) {
    console.log('Approving WETH for NFPM...');
    const tx = await weth.approve(NFPM, ethers.MaxUint256, { gasLimit: 60000n, nonce: nonce++ });
    console.log('WETH approve TX:', tx.hash);
    await tx.wait();
  } else { console.log('WETH already approved'); }

  const usdcAllowance = await usdc.allowance(wallet.address, NFPM);
  if (usdcAllowance < usdcBal) {
    console.log('Approving USDC for NFPM...');
    const tx = await usdc.approve(NFPM, ethers.MaxUint256, { gasLimit: 60000n, nonce: nonce++ });
    console.log('USDC approve TX:', tx.hash);
    await tx.wait();
  } else { console.log('USDC already approved'); }

  // Get current tick
  const pool = new ethers.Contract('0xd0b53D9277642d899DF5C87A3966A349A798F224', [
    'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)',
  ], rpc);
  const [, currentTick] = await pool.slot0();
  console.log('Current tick:', Number(currentTick));

  const tickSpacing = 10;
  const tickLower = Math.floor((Number(currentTick) - 5000) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((Number(currentTick) + 5000) / tickSpacing) * tickSpacing;
  console.log(`Range: ${tickLower} to ${tickUpper}`);

  // token0/token1 ordering (USDC < WETH by address)
  // USDC: 0x833... WETH: 0x420...  -> WETH is lower
  const wethLower = WETH.toLowerCase() < USDC.toLowerCase();
  const token0 = wethLower ? WETH : USDC;
  const token1 = wethLower ? USDC : WETH;
  console.log(`token0=${wethLower ? 'WETH' : 'USDC'}, token1=${wethLower ? 'USDC' : 'WETH'}`);

  // Use 80% of balances
  const lpWeth = (wethBal * 80n) / 100n;
  const lpUsdc = (usdcBal * 80n) / 100n;
  const amount0 = wethLower ? lpWeth : lpUsdc;
  const amount1 = wethLower ? lpUsdc : lpWeth;
  console.log(`LP: amount0=${ethers.formatUnits(amount0, wethLower ? 18 : 6)}, amount1=${ethers.formatUnits(amount1, wethLower ? 6 : 18)}`);

  const nfpm = new ethers.Contract(NFPM, [
    'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  ], wallet);

  nonce = await rpc.getTransactionCount(wallet.address);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  
  console.log('\nMinting LP position...');
  const mintTx = await nfpm.mint({
    token0, token1, fee: POOL_FEE,
    tickLower, tickUpper,
    amount0Desired: amount0, amount1Desired: amount1,
    amount0Min: 0n, amount1Min: 0n,
    recipient: wallet.address, deadline,
  }, { gasLimit: 500000n, nonce });

  console.log('Mint TX:', mintTx.hash);
  const receipt = await mintTx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  for (const log of receipt.logs) {
    if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.address.toLowerCase() === NFPM.toLowerCase()) {
      console.log('LP NFT Token ID:', BigInt(log.topics[3]).toString());
    }
  }

  const finalEth = await rpc.getBalance(wallet.address);
  const finalWeth = await weth.balanceOf(wallet.address);
  const finalUsdc = await usdc.balanceOf(wallet.address);
  console.log(`\nFinal: ETH=${ethers.formatEther(finalEth)}, WETH=${ethers.formatUnits(finalWeth, 18)}, USDC=${ethers.formatUnits(finalUsdc, 6)}`);
  console.log(`\nSwap TX: https://basescan.org/tx/0xe8b1b8060ad01b396dea768aeba50ff3cd5816d6340600c8e8ac4dff0701f26f`);
  console.log(`Mint TX: https://basescan.org/tx/${mintTx.hash}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
