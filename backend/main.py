from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.setup import router as setup_router
from api.chat import router as chat_router

app = FastAPI(title="Misconception-Driven Learning System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup_router)
app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
