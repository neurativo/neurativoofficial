/**
 * Render a Neurativo email template to HTML.
 * Called by email_service.py via subprocess:
 *   node_modules/.bin/tsx render.ts <template-name> '<props-json>'
 *
 * Outputs: HTML string to stdout
 * Errors:  message to stderr + exit 1
 */
import { render } from '@react-email/render';
import React from 'react';

const TEMPLATES: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  'welcome':              () => import('./templates/welcome.js'),
  'plan-upgraded':        () => import('./templates/plan-upgraded.js'),
  'plan-downgraded':      () => import('./templates/plan-downgraded.js'),
  'payment-failed':       () => import('./templates/payment-failed.js'),
  'credits-purchased':    () => import('./templates/credits-purchased.js'),
  'credits-refreshed':    () => import('./templates/credits-refreshed.js'),
  'lecture-ready':        () => import('./templates/lecture-ready.js'),
  'low-credits':          () => import('./templates/low-credits.js'),
  'team-invite':          () => import('./templates/team-invite.js'),
  'seat-activated':       () => import('./templates/seat-activated.js'),
  'seat-removed':         () => import('./templates/seat-removed.js'),
  'team-payment-failed':  () => import('./templates/team-payment-failed.js'),
};

async function main() {
  const [, , templateName, propsStr] = process.argv;

  if (!templateName) {
    process.stderr.write('Usage: tsx render.ts <template-name> <props-json>\n');
    process.stderr.write(`Available: ${Object.keys(TEMPLATES).join(', ')}\n`);
    process.exit(1);
  }

  const loader = TEMPLATES[templateName];
  if (!loader) {
    process.stderr.write(`Unknown template: "${templateName}"\n`);
    process.stderr.write(`Available: ${Object.keys(TEMPLATES).join(', ')}\n`);
    process.exit(1);
  }

  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(propsStr || '{}');
  } catch {
    process.stderr.write(`Invalid props JSON: ${propsStr}\n`);
    process.exit(1);
  }

  try {
    const mod = await loader();
    const Component = mod.default;
    const html = await render(React.createElement(Component, props));
    process.stdout.write(html);
  } catch (err: any) {
    process.stderr.write(`Render error (${templateName}): ${err?.message ?? err}\n`);
    process.exit(1);
  }
}

main();
