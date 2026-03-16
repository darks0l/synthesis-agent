#!/usr/bin/env node
// ── ERC-8183 Full Lifecycle Demo ──────────────────────────────────
// Posts a TradeEval job on-chain, self-fulfills, and completes it.
// Shows the full Open → Funded → Submitted → Completed state machine.
// All on Base mainnet with real USDC.

import { ethers } from 'ethers';
import fs from 'fs';

const RPC = 'https://mainnet.base.org';
const USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CONTRACT = '0xCB98F0e2bb429E4a05203C57750A97Db280e6617';
const EXPLORER = 'https://basescan.org';

const provider = new ethers.JsonRpcProvider(RPC);
const keyFile = fs.readFileSync(new URL('../../.keys/base-deployer.txt', import.meta.url), 'utf8');
const match = keyFile.match(/DEPLOYER_KEY=(0x[a-fA-F0-9]+)/);
const wallet = new ethers.Wallet(match[1], provider);

const abi = JSON.parse(fs.readFileSync(new URL('../build/contracts_SynthesisJobs_sol_SynthesisJobs.abi', import.meta.url), 'utf8'));
const contract = new ethers.Contract(CONTRACT, abi, wallet);

const usdc = new ethers.Contract(USDC_ADDR, [
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
], wallet);

async function main() {
  console.log('🌑 ERC-8183 Full Lifecycle Demo');
  console.log('═'.repeat(50));
  console.log(`Agent: ${wallet.address}`);
  console.log(`Contract: ${CONTRACT}`);

  const usdcBal = await usdc.balanceOf(wallet.address);
  console.log(`USDC: ${ethers.formatUnits(usdcBal, 6)}`);

  const budget = 50000n; // $0.05 USDC
  const expiry = Math.floor(Date.now() / 1000) + 300; // 5 min

  // 1. Approve USDC
  const allowance = await usdc.allowance(wallet.address, CONTRACT);
  if (allowance < budget) {
    console.log('\n📝 Step 0: Approving USDC...');
    const appTx = await usdc.approve(CONTRACT, ethers.MaxUint256);
    await appTx.wait();
    console.log(`   TX: ${EXPLORER}/tx/${appTx.hash}`);
  }

  // 2. Create job (Open state)
  const description = JSON.stringify({
    task: 'evaluate_trade',
    pair: 'WETH/USDC',
    spreadBps: 45,
    uniswapOut: '1.084',
    aerodromeOut: '1.089',
    betterDex: 'aerodrome',
    chain: 'base',
    expectedOutput: 'JSON: { execute: boolean, confidence: 0-100, reasoning: string }',
  });

  console.log('\n📋 Step 1: Creating TradeEval job (Open)...');
  const createTx = await contract.createJob(
    ethers.ZeroAddress,  // open bidding
    wallet.address,      // self as evaluator
    expiry,
    description,
    0,                   // SkillType.TradeEval
    budget
  );
  const createReceipt = await createTx.wait();
  
  // Parse JobCreated event
  const createdEvent = createReceipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === 'JobCreated');
  const jobId = createdEvent ? Number(createdEvent.args[0]) : 0;
  console.log(`   ✓ Job #${jobId} created — TX: ${EXPLORER}/tx/${createTx.hash}`);

  // 3. Set self as provider
  console.log('\n🤝 Step 2: Bidding on own job (self as provider)...');
  const provTx = await contract.setProvider(jobId, wallet.address);
  await provTx.wait();
  console.log(`   ✓ Provider set — TX: ${EXPLORER}/tx/${provTx.hash}`);

  // 4. Fund the job (Open → Funded)
  console.log('\n💰 Step 3: Funding job with $0.05 USDC (Funded)...');
  const fundTx = await contract.fund(jobId, budget);
  await fundTx.wait();
  console.log(`   ✓ Funded — TX: ${EXPLORER}/tx/${fundTx.hash}`);

  // 5. Submit work (Funded → Submitted)
  const result = { execute: true, confidence: 72, reasoning: 'Spread 45bps on WETH/USDC, Aerodrome offers better rate. Gas < expected profit. Execute.' };
  const deliverable = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result)));
  
  console.log('\n📦 Step 4: Submitting deliverable (Submitted)...');
  const submitTx = await contract.submit(jobId, deliverable);
  await submitTx.wait();
  console.log(`   ✓ Work submitted — TX: ${EXPLORER}/tx/${submitTx.hash}`);

  // 6. Complete with attestation (Submitted → Completed)
  const attestation = ethers.keccak256(ethers.toUtf8Bytes(`self-eval:quality-verified:${Date.now()}`));
  
  console.log('\n✅ Step 5: Evaluator completes job (Completed)...');
  const completeTx = await contract.complete(jobId, attestation);
  await completeTx.wait();
  console.log(`   ✓ Completed — TX: ${EXPLORER}/tx/${completeTx.hash}`);

  // 7. Verify final state
  const finalJob = await contract.getJob(jobId);
  const jobCount = await contract.jobCount();
  const avgCost = await contract.averageCost(0); // TradeEval
  
  console.log('\n═'.repeat(50));
  console.log('🌑 ERC-8183 Lifecycle Complete!');
  console.log(`   Job #${jobId}: ${['Open','Funded','Submitted','Completed','Rejected','Expired'][Number(finalJob[7])]}`);
  console.log(`   Total jobs on contract: ${jobCount}`);
  console.log(`   Market price for TradeEval: $${ethers.formatUnits(avgCost, 6)} USDC`);
  console.log(`   On-chain price discovery: ✓ active`);
  
  const newUsdcBal = await usdc.balanceOf(wallet.address);
  console.log(`   USDC remaining: ${ethers.formatUnits(newUsdcBal, 6)}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
