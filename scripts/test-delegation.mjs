#!/usr/bin/env node
// ── MetaMask Delegation Framework — On-Chain Lifecycle Test ──
// Creates, enables, disables, and re-enables a delegation on Base.
// Produces real transaction receipts on the DelegationManager.

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config + delegation module
const { config } = await import('../src/config.js');
const { DelegationManager } = await import('../src/delegation.js');

console.log(`
╔═════════════════════════════════════════════════════════╗
║  🔐 MetaMask Delegation Framework — On-Chain Test      ║
║  DelegationManager: 0xdb9B...47dB3 (Base)              ║
╚═════════════════════════════════════════════════════════╝
`);

// Connect
const provider = new ethers.JsonRpcProvider(config.chain.rpc);
console.log(`RPC: ${config.chain.rpc}`);

// Load wallet
const raw = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8');
const match = raw.match(/(?:DEPLOYER_KEY=)?(0x[a-fA-F0-9]{64})/);
if (!match) throw new Error('No private key found');
const wallet = new ethers.Wallet(match[1], provider);
console.log(`Wallet: ${wallet.address}`);

// Check balance
const balance = await provider.getBalance(wallet.address);
console.log(`ETH: ${ethers.formatEther(balance)}`);

if (balance < ethers.parseEther('0.0005')) {
  console.error('❌ Not enough ETH for gas — need at least 0.0005 ETH');
  process.exit(1);
}

// Initialize delegation manager
const delegationMgr = new DelegationManager(provider);
const ok = await delegationMgr.init();
if (!ok) {
  console.error('❌ Failed to connect to DelegationManager');
  process.exit(1);
}

// Run full lifecycle
console.log('\n🚀 Running full delegation lifecycle...\n');
const results = await delegationMgr.runFullLifecycle(wallet);

// Summary
console.log('\n═══════════════════════════════════════');
console.log('📋 RESULTS');
console.log('═══════════════════════════════════════');
for (const step of results.steps) {
  const icon = step.success === false ? '❌' : step.active === false ? '🔒' : '✅';
  console.log(`  ${icon} ${step.step}${step.txHash ? ` → ${step.txHash}` : ''}${step.active !== undefined ? ` (active: ${step.active})` : ''}${step.gasUsed ? ` [gas: ${step.gasUsed}]` : ''}`);
}
console.log(`\n🔗 On-chain TXs: ${results.txHashes.length}`);
for (const tx of results.txHashes) {
  console.log(`   https://basescan.org/tx/${tx}`);
}
console.log('');
