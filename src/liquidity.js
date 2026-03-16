// ── Liquidity Module ────────────────────────────────────────────────
// Autonomous concentrated liquidity management on Uniswap V3 (Base).
// The agent decides tick ranges, mints positions, monitors for out-of-range,
// collects fees, and rebalances — all autonomously.

import { ethers } from 'ethers';
import { config } from './config.js';
import { log } from './logger.js';

// ── Uniswap V3 Addresses (Base) ──
const POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const WETH = config.tokens.WETH;
const USDC = config.tokens.USDC;

// ── ABIs (minimal) ──
const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function tickSpacing() view returns (int24)',
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
];

const POSITION_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) returns (uint256 amount0, uint256 amount1)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// ── Tick math helpers ──
const MIN_TICK = -887272;
const MAX_TICK = 887272;

function nearestUsableTick(tick, tickSpacing) {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  return Math.max(MIN_TICK, Math.min(MAX_TICK, rounded));
}

// Convert sqrtPriceX96 to human-readable price (token1/token0)
function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
  const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  return price * (10 ** decimals0) / (10 ** decimals1);
}

// Estimate tick from price
function priceToTick(price) {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export class LiquidityManager {
  constructor(wallet) {
    this.wallet = wallet;
    this.provider = wallet.provider;
    this.factory = new ethers.Contract(FACTORY, FACTORY_ABI, this.provider);
    this.positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, this.wallet);
    this.positions = []; // tracked { tokenId, tickLower, tickUpper, liquidity, fee }
    this.stats = {
      positionsMinted: 0,
      feesCollected: { token0: 0n, token1: 0n },
      rebalances: 0,
      totalGasSpent: 0n,
    };
  }

  // ── Get pool info ──
  async getPoolInfo(fee = 3000) {
    const poolAddress = await this.factory.getPool(WETH, USDC, fee);
    if (poolAddress === ethers.ZeroAddress) {
      throw new Error(`No pool found for WETH/USDC fee=${fee}`);
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const [slot0, liquidity, tickSpacing, token0, token1] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
      pool.tickSpacing(),
      pool.token0(),
      pool.token1(),
    ]);

    const currentTick = Number(slot0.tick);
    const sqrtPriceX96 = slot0.sqrtPriceX96;

    // Determine token ordering (WETH vs USDC as token0)
    const wethIsToken0 = token0.toLowerCase() === WETH.toLowerCase();
    const decimals0 = wethIsToken0 ? 18 : 6;
    const decimals1 = wethIsToken0 ? 6 : 18;
    const rawPrice = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
    // Price as ETH/USDC (how many USDC per ETH)
    const ethPrice = wethIsToken0 ? (1 / rawPrice) : rawPrice;

    return {
      poolAddress,
      pool,
      currentTick,
      sqrtPriceX96,
      liquidity,
      tickSpacing: Number(tickSpacing),
      token0,
      token1,
      wethIsToken0,
      ethPrice,
    };
  }

  // ── Estimate recent volatility from tick observations ──
  async estimateVolatility(pool) {
    try {
      // Look at price 10 min ago vs now
      const observations = await pool.observe([600, 0]);
      const tickDelta = Number(observations.tickCumulatives[1] - observations.tickCumulatives[0]);
      const avgTick = tickDelta / 600;
      // Rough annualized vol estimate from tick movement
      const tickChange = Math.abs(avgTick);
      // Each tick ≈ 0.01% price move, scale to useful range width
      const suggestedRangeTicks = Math.max(200, Math.min(2000, Math.round(tickChange * 100)));
      return suggestedRangeTicks;
    } catch {
      // If observe fails (not enough observations), use default range
      return 600; // ~6% range each side at fee=3000
    }
  }

  // ── Calculate optimal tick range ──
  async calculateRange(poolInfo) {
    const { pool, currentTick, tickSpacing } = poolInfo;
    const rangeTicks = await this.estimateVolatility(pool);

    const tickLower = nearestUsableTick(currentTick - rangeTicks, tickSpacing);
    const tickUpper = nearestUsableTick(currentTick + rangeTicks, tickSpacing);

    const rangePercent = ((1.0001 ** rangeTicks - 1) * 100).toFixed(2);
    log('liquidity', `📐 Range: ${rangeTicks} ticks each side (~±${rangePercent}%) | ticks [${tickLower}, ${tickUpper}]`);

    return { tickLower, tickUpper, rangeTicks };
  }

  // ── Mint a new LP position ──
  async mintPosition(ethAmount = '0.001', fee = 3000) {
    log('liquidity', `🏗️ Minting concentrated LP position with ${ethAmount} ETH...`);

    const poolInfo = await this.getPoolInfo(fee);
    const { tickLower, tickUpper } = await this.calculateRange(poolInfo);
    const { token0, token1, wethIsToken0, ethPrice } = poolInfo;

    const ethWei = ethers.parseEther(ethAmount);

    // Calculate USDC needed for the other side of the position
    // For concentrated liquidity, we need both tokens
    // Use ~half ETH value in USDC
    const usdcNeeded = Math.floor(Number(ethAmount) * ethPrice * 0.5);
    const usdcWei = BigInt(usdcNeeded) * 1_000_000n; // USDC has 6 decimals

    // Check USDC balance
    const usdcContract = new ethers.Contract(USDC, ERC20_ABI, this.wallet);
    const usdcBalance = await usdcContract.balanceOf(this.wallet.address);

    if (usdcBalance < usdcWei) {
      log('liquidity', `⚠ Insufficient USDC. Have: ${ethers.formatUnits(usdcBalance, 6)}, need: ~${usdcNeeded}`);
      // Provide single-sided ETH position (only WETH side)
      // This works if current price is above our range
      log('liquidity', `📝 Attempting single-sided ETH position...`);
    }

    // Approve WETH spending (wrap ETH first)
    const wethContract = new ethers.Contract(WETH, [
      ...ERC20_ABI,
      'function deposit() payable',
    ], this.wallet);

    // Wrap ETH → WETH
    log('liquidity', `🔄 Wrapping ${ethAmount} ETH → WETH...`);
    const wrapTx = await wethContract.deposit({ value: ethWei });
    await wrapTx.wait();
    log('liquidity', `✅ Wrapped. TX: ${wrapTx.hash}`);

    // Approve position manager to spend WETH
    const wethAllowance = await wethContract.allowance(this.wallet.address, POSITION_MANAGER);
    if (wethAllowance < ethWei) {
      const approveTx = await wethContract.approve(POSITION_MANAGER, ethers.MaxUint256);
      await approveTx.wait();
      log('liquidity', `✅ WETH approved for position manager`);
    }

    // Approve USDC if we have it
    const actualUsdcAmount = usdcBalance < usdcWei ? usdcBalance : usdcWei;
    if (actualUsdcAmount > 0n) {
      const usdcAllowance = await usdcContract.allowance(this.wallet.address, POSITION_MANAGER);
      if (usdcAllowance < actualUsdcAmount) {
        const approveTx = await usdcContract.approve(POSITION_MANAGER, ethers.MaxUint256);
        await approveTx.wait();
        log('liquidity', `✅ USDC approved for position manager`);
      }
    }

    // Order amounts by token0/token1
    const amount0Desired = wethIsToken0 ? ethWei : actualUsdcAmount;
    const amount1Desired = wethIsToken0 ? actualUsdcAmount : ethWei;

    // Mint position
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min

    log('liquidity', `🎰 Minting position: token0=${amount0Desired}, token1=${amount1Desired}, ticks=[${tickLower},${tickUpper}]`);

    try {
      const mintTx = await this.positionManager.mint({
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min: 0, // Accept any amount for demo
        amount1Min: 0,
        recipient: this.wallet.address,
        deadline,
      });

      const receipt = await mintTx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      this.stats.totalGasSpent += gasUsed;

      // Parse tokenId from logs
      const transferLog = receipt.logs.find(l =>
        l.topics[0] === ethers.id('Transfer(address,address,uint256)') &&
        l.address.toLowerCase() === POSITION_MANAGER.toLowerCase()
      );
      const tokenId = transferLog ? BigInt(transferLog.topics[3]) : null;

      if (tokenId !== null) {
        this.positions.push({
          tokenId: Number(tokenId),
          tickLower,
          tickUpper,
          fee,
          mintedAt: Date.now(),
        });
        this.stats.positionsMinted++;

        log('liquidity', `✅ Position minted! TokenId: ${tokenId} | TX: ${mintTx.hash}`);
        log('liquidity', `   Gas: ${ethers.formatEther(gasUsed)} ETH | Range: [${tickLower}, ${tickUpper}]`);

        return {
          tokenId: Number(tokenId),
          txHash: mintTx.hash,
          tickLower,
          tickUpper,
          gasUsed,
        };
      } else {
        log('liquidity', `✅ Mint TX confirmed but couldn't parse tokenId. TX: ${mintTx.hash}`);
        return { txHash: mintTx.hash, tickLower, tickUpper, gasUsed };
      }
    } catch (err) {
      log('liquidity', `❌ Mint failed: ${err.message}`);
      // Unwrap WETH back to ETH on failure
      try {
        const wethBal = await wethContract.balanceOf(this.wallet.address);
        if (wethBal > 0n) {
          const unwrapTx = await wethContract.withdraw(wethBal);
          await unwrapTx.wait();
          log('liquidity', `🔄 Unwrapped WETH back to ETH`);
        }
      } catch {}
      throw err;
    }
  }

  // ── Check if a position is in range ──
  async checkPosition(tokenId) {
    const pos = await this.positionManager.positions(tokenId);
    const fee = Number(pos.fee);
    const tickLower = Number(pos.tickLower);
    const tickUpper = Number(pos.tickUpper);
    const liquidity = pos.liquidity;
    const tokensOwed0 = pos.tokensOwed0;
    const tokensOwed1 = pos.tokensOwed1;

    const poolInfo = await this.getPoolInfo(fee);
    const inRange = poolInfo.currentTick >= tickLower && poolInfo.currentTick <= tickUpper;

    return {
      tokenId,
      tickLower,
      tickUpper,
      liquidity,
      fee,
      currentTick: poolInfo.currentTick,
      inRange,
      tokensOwed0,
      tokensOwed1,
      ethPrice: poolInfo.ethPrice,
    };
  }

  // ── Collect accumulated fees ──
  async collectFees(tokenId) {
    log('liquidity', `💰 Collecting fees for position ${tokenId}...`);

    try {
      const tx = await this.positionManager.collect({
        tokenId,
        recipient: this.wallet.address,
        amount0Max: BigInt('340282366920938463463374607431768211455'), // uint128 max
        amount1Max: BigInt('340282366920938463463374607431768211455'),
      });

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      this.stats.totalGasSpent += gasUsed;

      // Parse Transfer events to see what we collected
      const transferLogs = receipt.logs.filter(l =>
        l.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );

      let collected0 = 0n, collected1 = 0n;
      for (const tLog of transferLogs) {
        const amount = BigInt(tLog.data);
        if (tLog.address.toLowerCase() === WETH.toLowerCase()) collected0 = amount;
        if (tLog.address.toLowerCase() === USDC.toLowerCase()) collected1 = amount;
      }

      this.stats.feesCollected.token0 += collected0;
      this.stats.feesCollected.token1 += collected1;

      const wethCollected = ethers.formatEther(collected0);
      const usdcCollected = ethers.formatUnits(collected1, 6);
      log('liquidity', `✅ Collected: ${wethCollected} WETH + ${usdcCollected} USDC | TX: ${tx.hash}`);

      return { txHash: tx.hash, weth: collected0, usdc: collected1 };
    } catch (err) {
      log('liquidity', `⚠ Fee collection failed: ${err.message}`);
      return null;
    }
  }

  // ── Remove liquidity from a position ──
  async removeLiquidity(tokenId) {
    log('liquidity', `🔻 Removing liquidity from position ${tokenId}...`);

    const pos = await this.positionManager.positions(tokenId);
    if (pos.liquidity === 0n) {
      log('liquidity', `⚠ Position ${tokenId} has no liquidity`);
      return null;
    }

    const deadline = Math.floor(Date.now() / 1000) + 600;

    try {
      const tx = await this.positionManager.decreaseLiquidity({
        tokenId,
        liquidity: pos.liquidity,
        amount0Min: 0,
        amount1Min: 0,
        deadline,
      });

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      this.stats.totalGasSpent += gasUsed;

      log('liquidity', `✅ Liquidity removed. TX: ${tx.hash}`);

      // Collect the tokens
      await this.collectFees(tokenId);

      // Remove from tracked positions
      this.positions = this.positions.filter(p => p.tokenId !== tokenId);

      return { txHash: tx.hash, gasUsed };
    } catch (err) {
      log('liquidity', `❌ Remove liquidity failed: ${err.message}`);
      throw err;
    }
  }

  // ── Rebalance: remove old position + mint new one at current price ──
  async rebalance(tokenId, ethAmount = '0.001') {
    log('liquidity', `🔄 Rebalancing position ${tokenId}...`);
    this.stats.rebalances++;

    // Remove old position
    await this.removeLiquidity(tokenId);

    // Small delay for state propagation
    await new Promise(r => setTimeout(r, 2000));

    // Mint new position at current price
    const pos = this.positions.find(p => p.tokenId === tokenId);
    const fee = pos?.fee || 3000;
    return this.mintPosition(ethAmount, fee);
  }

  // ── Monitor all positions — called periodically ──
  async monitorPositions() {
    if (this.positions.length === 0) {
      // Check if we have positions on-chain we haven't loaded
      await this.loadExistingPositions();
      if (this.positions.length === 0) return null;
    }

    const results = [];
    for (const tracked of [...this.positions]) {
      try {
        const status = await this.checkPosition(tracked.tokenId);
        results.push(status);

        if (!status.inRange) {
          log('liquidity', `⚠ Position ${tracked.tokenId} OUT OF RANGE! Tick: ${status.currentTick} vs [${status.tickLower}, ${status.tickUpper}]`);
          // Don't auto-rebalance — log it for the agent decision loop
        } else {
          log('liquidity', `✅ Position ${tracked.tokenId} in range. Tick: ${status.currentTick} ∈ [${status.tickLower}, ${status.tickUpper}]`);
        }

        // Collect fees if any are owed
        if (status.tokensOwed0 > 0n || status.tokensOwed1 > 0n) {
          await this.collectFees(tracked.tokenId);
        }
      } catch (err) {
        log('liquidity', `⚠ Error checking position ${tracked.tokenId}: ${err.message}`);
      }
    }

    return results;
  }

  // ── Load existing positions from on-chain ──
  async loadExistingPositions() {
    try {
      const count = await this.positionManager.balanceOf(this.wallet.address);
      log('liquidity', `📋 Found ${count} existing NFT position(s) on-chain`);

      for (let i = 0; i < Number(count); i++) {
        const tokenId = await this.positionManager.tokenOfOwnerByIndex(this.wallet.address, i);
        const pos = await this.positionManager.positions(tokenId);

        // Only track positions with liquidity in our WETH/USDC pools
        if (pos.liquidity > 0n) {
          const isOurPool =
            (pos.token0.toLowerCase() === WETH.toLowerCase() && pos.token1.toLowerCase() === USDC.toLowerCase()) ||
            (pos.token0.toLowerCase() === USDC.toLowerCase() && pos.token1.toLowerCase() === WETH.toLowerCase());

          if (isOurPool) {
            this.positions.push({
              tokenId: Number(tokenId),
              tickLower: Number(pos.tickLower),
              tickUpper: Number(pos.tickUpper),
              fee: Number(pos.fee),
              mintedAt: Date.now(),
            });
            log('liquidity', `  → Loaded position ${tokenId}: ticks [${pos.tickLower}, ${pos.tickUpper}], liquidity: ${pos.liquidity}`);
          }
        }
      }
    } catch (err) {
      log('liquidity', `⚠ Could not load existing positions: ${err.message}`);
    }
  }

  // ── Get summary for reporting ──
  getSummary() {
    return {
      activePositions: this.positions.length,
      totalMinted: this.stats.positionsMinted,
      rebalances: this.stats.rebalances,
      feesCollected: {
        weth: ethers.formatEther(this.stats.feesCollected.token0),
        usdc: ethers.formatUnits(this.stats.feesCollected.token1, 6),
      },
      totalGasSpent: ethers.formatEther(this.stats.totalGasSpent),
      positions: this.positions.map(p => ({
        tokenId: p.tokenId,
        range: [p.tickLower, p.tickUpper],
        fee: p.fee,
      })),
    };
  }
}
