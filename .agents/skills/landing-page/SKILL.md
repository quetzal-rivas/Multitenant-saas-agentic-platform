---
name: landing-page
description: >
  Documentation and insights for the Landing Page component. This skill explains
  every button, field functionality, core dynamic, best practices, and insights.
---

## Role

You are an expert developer specialized in the "Landing Page" component (typically `app/page.tsx`). Your responsibility is to deeply understand its UI, functionality, core dynamics, and best practices.

## Guidelines

- **Component Knowledge:** Know every button, section, scroll interaction, and core dynamic of the Landing Page.
- **Continuous Update:** When asked to modify the Landing Page, you must apply best practices, commit and push the changes, and subsequently update this skill file to reflect the new state of the component.
- **Single Source of Truth:** Do not create more than one skill for this component. This file (`SKILL.md` under `landing-page`) is the only skill file for it.
- **Scope Restriction:** You can reference other components to understand context, but you CANNOT modify out-of-scope components. Only modify the Landing Page and this skill file when tasked with it.

## Component Overview
The Landing Page (`app/page.tsx`) serves as the main marketing and entry point for Context Control. It features a modern, dark-themed UI with glassmorphism elements and responsive layouts.
Key sections include:
- **Top Navigation**: Contains brand logo, marketing links, and contextual auth buttons (Go to Dashboard vs Sign In/Get Started Free).
- **Hero Section**: Highlights core value proposition with an animated radial gradient background and 4 core value metric cards (Agent & Team Studio, Voice Telephony Engine, Task Calendar Queue, MCP Hub & Tools).
- **Features Grid**: Details the 4 core platform capabilities with descriptive icons.
- **Visual Workspace Showcase**: Displays a preview image of the SaaS dashboard (`/docs/images/agent_studio.png`).
- **Pricing Section**: Displays 3 multitenant pricing tiers (Tier 1, Tier 2, Enterprise). The call-to-action buttons for these tiers are integrated with Stripe Checkout, redirecting users to Stripe Hosted Payment Links:
  - **Tier 1 ($250/mo)**: Redirects to Stripe Checkout for subscription.
  - **Tier 2 ($500/mo)**: Redirects to Stripe Checkout for subscription.
  - **Enterprise ($150/mo + $1500 Setup)**: Redirects to Stripe Checkout for subscription + setup fee.

## Best Practices
- Always use modern UI/UX design principles (especially crucial for a landing page!).
- Ensure fast load times, responsive design, and engaging visual aesthetics (vibrant colors, glassmorphism, dynamic animations).
- Implement SEO best practices automatically (Title Tags, Meta Descriptions, Semantic HTML).
- Ensure the landing page seamlessly funnels users into the rest of the application (e.g., the dashboard).
