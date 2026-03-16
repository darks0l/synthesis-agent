#!/usr/bin/env node
// Deploy AgentSpendingPolicy to Base
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { config } from '../src/config.js';

const raw = readFileSync('C:/Users/favcr/.openclaw/workspace/.keys/base-deployer.txt', 'utf8');
const match = raw.match(/DEPLOYER_KEY=(0x[a-fA-F0-9]+)/);
const pk = match[1];

const provider = new ethers.JsonRpcProvider(config.chain.rpc);
const wallet = new ethers.Wallet(pk, provider);

const abi = JSON.parse(readFileSync('C:/Users/favcr/.openclaw/workspace/synthesis-agent/contracts_AgentSpendingPolicy_sol_AgentSpendingPolicy.abi', 'utf8'));
const bin = readFileSync('C:/Users/favcr/.openclaw/workspace/synthesis-agent/contracts_AgentSpendingPolicy_sol_AgentSpendingPolicy.bin', 'utf8');

async function main() {
  console.log(`Deployer: ${wallet.address}`);
  const ethBal = await provider.getBalance(wallet.address);
  console.log(`ETH: ${ethers.formatEther(ethBal)}`);

  // Constructor args:
  // _agent: our agent wallet
  // _maxPerTx: 2 USDC (2_000_000 in 6 decimals)
  // _maxDaily: 20 USDC (20_000_000)
  // _cooldownMs: 30000 (30 seconds)
  // _approvedTargets: [Uniswap SwapRouter02, Aerodrome Router]
  const agentAddr = config.agentAddress;
  const maxPerTx = 2_000_000n;     // 2 USDC
  const maxDaily = 20_000_000n;    // 20 USDC
  const cooldown = 30_000n;        // 30s
  const targets = [
    config.uniswap.routerV3,                          // Uniswap SwapRouter02
    '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',   // Aerodrome Router
  ];

  console.log(`\nDeploying AgentSpendingPolicy...`);
  console.log(`  Agent: ${agentAddr}`);
  console.log(`  Max/tx: ${maxPerTx} (${Number(maxPerTx)/1e6} USDC)`);
  console.log(`  Max/day: ${maxDaily} (${Number(maxDaily)/1e6} USDC)`);
  console.log(`  Cooldown: ${cooldown}ms`);
  console.log(`  Targets: ${targets.join(', ')}`);

  const factory = new ethers.ContractFactory(abi, '0x' + bin, wallet);
  const contract = await factory.deploy(agentAddr, maxPerTx, maxDaily, cooldown, targets);
  
  console.log(`\nTX: ${contract.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation...');
  
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  
  console.log(`\n✅ AgentSpendingPolicy deployed!`);
  console.log(`Address: ${addr}`);
  console.log(`Explorer: ${config.chain.explorer}/address/${addr}`);
  
  // Verify it works
  const policy = await contract.getPolicy();
  console.log(`\nPolicy verified:`);
  console.log(`  Agent: ${policy._agent}`);
  console.log(`  Max/tx: ${Number(policy._maxPerTx)/1e6} USDC`);
  console.log(`  Max/day: ${Number(policy._maxDaily)/1e6} USDC`);
  console.log(`  Remaining: ${Number(policy._remaining)/1e6} USDC`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
