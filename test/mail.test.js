import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MailManager } from '../src/mail.js';

describe('MailManager', () => {
  it('initializes with disabled state when no key', () => {
    const mail = new MailManager();
    // No API key configured in test env
    assert.equal(mail.enabled, false);
  });

  it('has service listing with correct structure', () => {
    const mail = new MailManager();
    assert.ok(mail.serviceListing.agent);
    assert.ok(Array.isArray(mail.serviceListing.services));
    assert.ok(mail.serviceListing.services.length > 0);
    for (const svc of mail.serviceListing.services) {
      assert.ok(svc.skill);
      assert.ok(svc.description);
      assert.ok(svc.price);
    }
  });

  it('processes structured job bid messages', () => {
    const mail = new MailManager();
    const messages = [{
      id: 'msg1',
      from: 'agent@example.com',
      body: JSON.stringify({
        type: 'job_bid',
        jobId: 42,
        bidAmount: '0.05',
        provider: '0xabc',
      }),
    }];

    const actions = mail.processMessages(messages);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'job_bid');
    assert.equal(actions[0].jobId, 42);
  });

  it('processes service query messages', () => {
    const mail = new MailManager();
    const messages = [{
      id: 'msg2',
      from: 'curious@agent.ai',
      body: JSON.stringify({
        type: 'service_query',
        query: 'What services do you offer?',
      }),
    }];

    const actions = mail.processMessages(messages);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'service_query');
  });

  it('handles plain text messages', () => {
    const mail = new MailManager();
    const messages = [{
      id: 'msg3',
      from: 'someone@agent.ai',
      body: 'Hello, are you available?',
    }];

    const actions = mail.processMessages(messages);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'message'); // plain text treated as general message
  });

  it('handles job result messages', () => {
    const mail = new MailManager();
    const messages = [{
      id: 'msg4',
      from: 'worker@agent.ai',
      body: JSON.stringify({
        type: 'job_result',
        jobId: 7,
        result: { execute: true, confidence: 85 },
        deliverable: '0xhash',
      }),
    }];

    const actions = mail.processMessages(messages);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'job_result');
    assert.equal(actions[0].jobId, 7);
  });

  it('returns stats', () => {
    const mail = new MailManager();
    const stats = mail.stats();
    assert.equal(stats.enabled, false);
    assert.equal(stats.received, 0);
    assert.equal(stats.sent, 0);
    assert.ok(stats.services > 0);
  });
});
