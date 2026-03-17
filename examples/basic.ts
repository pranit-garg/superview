import { writeAndOpen } from 'superview';

// Render a tweet
await writeAndOpen('Just shipped superview: render AI output as beautiful HTML with feedback loops. Zero config, one command.', {
  type: 'tweet',
  title: 'Launch tweet',
  metadata: { handle: '@Pranit' },
});

// Render an email
await writeAndOpen(`To: team@example.com
Subject: Q1 Results

Hey team,

Q1 numbers are in. Revenue up 23%, churn down to 4.2%.

Three things driving this:
1. Self-serve onboarding (launched Jan)
2. Annual plan pricing (Feb)
3. Enterprise pipeline converting (ongoing)

Next quarter focus: expand into APAC.

Best,
Pranit`, {
  type: 'email',
  title: 'Q1 Results',
});
