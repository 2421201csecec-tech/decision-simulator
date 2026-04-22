# Eidoz Core Backend (FastAPI)

This is the Phase A core backend skeleton used by strangler migration.

## Run

1. Create a virtual environment
2. Install dependencies
3. Start FastAPI app

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints (Phase A)

- GET /api/v1/health
- GET /api/v1/threads
- POST /api/v1/threads

## Notes

- This backend is designed to be called by existing Next route handlers.
- Frontend contract parity is enforced before broader route cutover.
