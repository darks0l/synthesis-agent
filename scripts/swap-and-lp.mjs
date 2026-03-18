import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Try multiple RPCs
let rpc;
for (const url of ['https://mainnet.base.org', 'https://base-mainnet.public.blastapi.io', 'https://base.llamarpc.com', 'https://1rpc.io/base']) {
  try {
    const p = new ethers.JsonRpcProvider(url);
    await p.getBlockNumber();
    rpc = p;
    console.log('Using RPC:', url);
    break;
  } catch { continue; }
}
if (!rpc) throw new Error('All RPCs failed');
const raw = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8');
const match = raw.match(/(?:DEPLOYER_KEY=)?(0x[a-fA-F0-9]{64})/);
const wallet = new ethers.Wallet(match[1], rpc);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const NFPM = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const POOL_FEE = 500; // 0.05% fee tier (most liquid WETH/USDC pool on Base)

async function main() {
  const usdcContract = new ethers.Contract(USDC, [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function allowance(address,address) view returns (uint256)',
  ], wallet);

  const wethContract = new ethers.Contract(WETH, [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function allowance(address,address) view returns (uint256)',
    'function deposit() payable',
  ], wallet);

  const usdcBal = await usdcContract.balanceOf(wallet.address);
  const ethBal = await rpc.getBalance(wallet.address);
  console.log(`Starting: ETH=${ethers.formatEther(ethBal)}, USDC=${ethers.formatUnits(usdcBal, 6)}`);

  // Step 1: Swap half USDC to WETH via SwapRouter02
  const swapAmount = usdcBal / 2n; // half
  console.log(`\nStep 1: Swapping ${ethers.formatUnits(swapAmount, 6)} USDC -> WETH`);

  const swapRouter = new ethers.Contract(SWAP_ROUTER, [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  ], wallet);

  const swapParams = {
    tokenIn: USDC,
    tokenOut: WETH,
    fee: POOL_FEE,
    recipient: wallet.address,
    amountIn: swapAmount,
    amountOutMinimum: 0n, // accepting any amount for hackathon demo
    sqrtPriceLimitX96: 0n,
  };

  const swapTx = await swapRouter.exactInputSingle(swapParams, { gasLimit: 300000n });
  console.log(`Swap TX: ${swapTx.hash}`);
  const swapReceipt = await swapTx.wait();
  console.log(`Swap confirmed in block ${swapReceipt.blockNumber}`);

  // Check new balances
  const wethBal = await wethContract.balanceOf(wallet.address);
  const newUsdcBal = await usdcContract.balanceOf(wallet.address);
  const newEthBal = await rpc.getBalance(wallet.address);
  console.log(`After swap: ETH=${ethers.formatEther(newEthBal)}, WETH=${ethers.formatUnits(wethBal, 18)}, USDC=${ethers.formatUnits(newUsdcBal, 6)}`);

  // Step 2: Approve NFPM for WETH and USDC
  console.log('\nStep 2: Approving NFPM for WETH + USDC');
  let nonce = await rpc.getTransactionCount(wallet.address);
  const wethAllowance = await wethContract.allowance(wallet.address, NFPM);
  if (wethAllowance < wethBal) {
    const approveTx = await wethContract.approve(NFPM, ethers.MaxUint256, { gasLimit: 100000n, nonce: nonce++ });
    console.log(`WETH approve TX: ${approveTx.hash}`);
    await approveTx.wait();
    console.log('WETH approved');
  } else {
    console.log('WETH already approved');
  }

  const usdcAllowance = await usdcContract.allowance(wallet.address, NFPM);
  if (usdcAllowance < newUsdcBal) {
    const approveTx = await usdcContract.approve(NFPM, ethers.MaxUint256, { gasLimit: 100000n, nonce: nonce++ });
    console.log(`USDC approve TX: ${approveTx.hash}`);
    await approveTx.wait();
    console.log('USDC approved');
  } else {
    console.log('USDC already approved');
  }

  // Step 3: Get current tick from pool
  console.log('\nStep 3: Getting current pool tick');
  const poolAddress = '0xd0b53D9277642d899DF5C87A3966A349A798F224'; // WETH/USDC 0.05% pool on Base
  const pool = new ethers.Contract(poolAddress, [
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  ], rpc);

  const slot0 = await pool.slot0();
  const currentTick = Number(slot0.tick);
  console.log(`Current tick: ${currentTick}`);

  // Set tick range: +/- ~10% around current price (wide range for demo)
  const tickSpacing = 10; // 0.05% fee tier uses tick spacing of 10
  const tickLower = Math.floor((currentTick - 5000) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((currentTick + 5000) / tickSpacing) * tickSpacing;
  console.log(`Tick range: ${tickLower} to ${tickUpper} (~10% around current price)`);

  // Step 4: Mint LP position
  console.log('\nStep 4: Minting Uniswap V3 LP position');
  // Use 90% of available balances to account for rounding
  const lpWeth = (wethBal * 90n) / 100n;
  const lpUsdc = (newUsdcBal * 90n) / 100n;
  console.log(`LP amounts: WETH=${ethers.formatUnits(lpWeth, 18)}, USDC=${ethers.formatUnits(lpUsdc, 6)}`);

  // Determine token0/token1 ordering (lower address = token0)
  const token0 = WETH.toLowerCase() < USDC.toLowerCase() ? WETH : USDC;
  const token1 = WETH.toLowerCase() < USDC.toLowerCase() ? USDC : WETH;
  const amount0 = token0 === WETH ? lpWeth : lpUsdc;
  const amount1 = token0 === WETH ? lpUsdc : lpWeth;
  // Tick ordering must match token ordering
  const mintTickLower = token0 === WETH ? tickLower : -tickUpper;
  const mintTickUpper = token0 === WETH ? tickUpper : -tickLower;

  console.log(`Token0: ${token0 === WETH ? 'WETH' : 'USDC'}, Token1: ${token0 === WETH ? 'USDC' : 'WETH'}`);

  const nfpm = new ethers.Contract(NFPM, [
    'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  ], wallet);

  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min

  const mintTx = await nfpm.mint({
    token0,
    token1,
    fee: POOL_FEE,
    tickLower: mintTickLower,
    tickUpper: mintTickUpper,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: wallet.address,
    deadline,
  }, { gasLimit: 500000n });

  console.log(`Mint TX: ${mintTx.hash}`);
  const mintReceipt = await mintTx.wait();
  console.log(`LP position minted in block ${mintReceipt.blockNumber}!`);

  // Parse transfer event to get token ID
  for (const log of mintReceipt.logs) {
    if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.address.toLowerCase() === NFPM.toLowerCase()) {
      const tokenId = BigInt(log.topics[3]);
      console.log(`LP NFT Token ID: ${tokenId}`);
    }
  }

  // Final balances
  const finalEth = await rpc.getBalance(wallet.address);
  const finalWeth = await wethContract.balanceOf(wallet.address);
  const finalUsdc = await usdcContract.balanceOf(wallet.address);
  console.log(`\nFinal: ETH=${ethers.formatEther(finalEth)}, WETH=${ethers.formatUnits(finalWeth, 18)}, USDC=${ethers.formatUnits(finalUsdc, 6)}`);
  
  console.log('\n--- SUMMARY ---');
  console.log(`Swap TX: https://basescan.org/tx/${swapTx.hash}`);
  console.log(`Mint TX: https://basescan.org/tx/${mintTx.hash}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
