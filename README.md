# Cyrnel Origin - Gumroad Automator

This repository contains the Netlify serverless function that automatically processes sales from the Gumroad store.

## Function
- **`process-sale`**: Listens for Gumroad webhooks. On a new sale, it triggers the AI audit generation workflow.

## Deployment
This function is automatically deployed to Netlify when pushed to the `main` branch.
