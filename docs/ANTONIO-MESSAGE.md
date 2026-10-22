# Message to Antonio

**Subject:** Sojern × Brew POC — working demo, source and quick-start guide

Hi Antonio,

I've put together a working demo and a standalone repository for the workflow
we discussed: extract a hotel brand, create an on-brand email, refine it with AI,
and let designers edit it inside an embedded canvas in your existing admin app.
It also covers selecting a template to create separate language variants,
browsing/renaming groups and emails, and retrieving saved HTML.

- Demo: https://sojern-brew-demo.vercel.app/
- Source: https://github.com/GetBrew/sojern-brew-demo
- Start here: https://github.com/GetBrew/sojern-brew-demo/blob/main/docs/POC-GUIDE.md
- Detailed guide and agent prompts: https://sojern-brew-demo.vercel.app/sojern-implementation-guide.md
- PDF: https://sojern-brew-demo.vercel.app/sojern-implementation-guide.pdf

To try it, enter your Brew organization API key in the demo and leave the
optional canvas client ID blank initially. Select a ready hotel or extract a
test hotel's website, create an English email, select it as the reference for a
French variant, then test an AI edit, a manual edit and **Save & HTML**. Fresh
extraction needs an available brand slot, and AI actions use account credits.
Please keep keys out of messages and agent prompts.

For the POC in Sojern, you can keep your existing staff login, hotel records and
delivery flow. The guide shows how to add backend brand/email operations and a
persistent SDK canvas, with organization credentials kept on your backend.
There is also an optional publishable canvas client ID that can allow all hotel
brands in your organization or a specific brand.

The repository includes local setup, strict TypeScript checks, tests, `AGENTS.md`
and complete implementation prompts so your team or coding agents can start
from the working example. The POC guide calls out the access checks, exact-save
behavior and current API boundaries to validate in your own environment.

When you've chosen a test hotel, target languages and HTTPS admin origin, send
those details and any blockers back to us. We can review the first full workflow
together before connecting it to your delivery process.
