# Next.js API routes for LLM calls

All Anthropic calls go through Next.js API routes server-side so the API key never reaches the browser. The client calls our own endpoint which assembles context and enforces anti-leak filtering before streaming.

Considered Options: FastAPI Python service (useful later if server sandbox needed) but adds infra for MVP.
