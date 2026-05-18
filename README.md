# AfyaMind

AfyaMind is a mental wellness frontend built with React and a Go backend for authentication and AI-assisted chat.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind
- Backend: Go, `chi`, SQLite
- AI: OpenAI Responses API or local Ollama fallback

## Project Structure

```text
src/                    React app
backend/                Go backend with chi router
  cmd/server/           app entrypoint
  internal/config/      environment config
  internal/httpapi/     routes, handlers, middleware
  internal/store/       SQLite persistence
  internal/ai/          OpenAI, Ollama, fallback chat service
hackathon2/             legacy backend prototype kept untouched
```

## Run Locally

1. Frontend dependencies are already managed with `npm`.
2. Copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY` if you want OpenAI chat.
3. Start the backend:

```bash
npm run dev:backend
```

4. In another terminal, start the frontend:

```bash
npm run dev:frontend
```

The frontend talks to `http://localhost:8080` automatically when running on localhost.

## Backend Environment

Important variables in `backend/.env`:

- `PORT`: backend port, defaults to `8080`
- `DB_PATH`: SQLite file location
- `AI_PROVIDER`: `openai`, `ollama`, or `fallback`
- `OPENAI_API_KEY`: required for OpenAI chat
- `OPENAI_MODEL`: defaults to `gpt-5.4-mini`
- `OLLAMA_MODEL`: defaults to `llama3.2:3b`
- `OLLAMA_CHAT_URL`: defaults to `http://127.0.0.1:11434/api/chat`

## Useful Commands

```bash
npm run dev:frontend
npm run dev:backend
npm run build
npm run build:backend
npm run test
npm run test:backend
```

## API Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `POST /api/ai/assistant`
