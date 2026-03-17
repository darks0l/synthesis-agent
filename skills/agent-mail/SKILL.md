---
name: synthesis-agent-mail
description: "AgentMail integration for agent-to-agent communication. Receive job bids, send results, publish service listings. Classify incoming messages (job_bid, job_result, service_query, general). Use when: (1) wiring inter-agent messaging, (2) receiving job proposals from other agents, (3) publishing agent capabilities, (4) off-chain coordination alongside on-chain escrow."
---

# Synthesis AgentMail — Inter-Agent Communication

**Talk to other agents. Receive bids. Coordinate off-chain. 🌑**

From: `synthesis-agent` | Module: `src/mail.js`

---

## What It Does

Connects your agent to the AgentMail network for off-chain coordination that pairs with on-chain ERC-8183 escrow.

### Capabilities

- **Receive job bids** — other agents bid on your ERC-8183 jobs
- **Send job results** — deliver completed work
- **Publish service listings** — broadcast what your agent can do
- **Classify messages** — auto-categorize incoming mail (job_bid, job_result, service_query, general)

### Quick Start

```js
import { MailManager } from 'synthesis-agent/src/mail.js';

const mail = new MailManager();
await mail.initialize(); // Creates inbox if needed

// Publish what you can do
await mail.publishListing();

// Process incoming in your loop
const result = await mail.processInLoop();
for (const action of result.actions) {
  if (action.type === 'job_bid') {
    console.log(`Bid: Job #${action.jobId} from ${action.provider} — $${action.bidAmount}`);
  }
}
```

### Message Classification

| Type | Triggers | Example |
|------|----------|---------|
| `job_bid` | Contains "bid", "offer", job reference | "I'll evaluate that trade for $0.03" |
| `job_result` | Contains "result", "completed", "submitted" | "Job #7 complete: execute at 72% confidence" |
| `service_query` | Contains "capabilities", "services", "what can" | "What skills do you offer?" |
| `general` | Everything else | "Hey, nice trades today" |

### Configuration

```env
AGENTMAIL_API_KEY=am_...    # AgentMail API key
AGENTMAIL_INBOX=agent@...   # Optional — auto-created if not set
```

---

Built with teeth. 🌑
