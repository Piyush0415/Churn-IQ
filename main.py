from pathlib import Path
from typing import Annotated, Literal

import joblib
import pandas as pd
import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, computed_field

import json
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"
STATIC_DIR = BASE_DIR / "static"
HISTORY_FILE = BASE_DIR / "history.json"

# Keep model.pkl in the same directory as this file.
model = joblib.load(MODEL_PATH)

app = FastAPI(title="ChurnIQ Customer Churn Prediction API")
logger = logging.getLogger("uvicorn.error")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def load_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as err:
        logger.warning("Could not read history.json: %s", err)
        return []


def save_history(records: list[dict]) -> None:
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
    except Exception as err:
        logger.warning("Could not write history.json: %s", err)


class UserInput(BaseModel):
    contract: Annotated[
        Literal["Month-to-month", "One year", "Two year"],
        Field(description="Contract type"),
    ]
    tenure_month: Annotated[int, Field(ge=0, description="Tenure in months")]
    totalcharges: Annotated[float, Field(ge=0, description="Total charges")]
    paymentmethod: Annotated[
        Literal["Electronic check", "Mailed check", "Other"],
        Field(description="Payment method"),
    ]
    internetservice: Annotated[
        Literal["Fiber optic", "Other"],
        Field(description="Internet service"),
    ]
    onlinesecurity: Annotated[
        Literal["Yes", "No", "Other"],
        Field(description="Online security"),
    ]
    techsupport: Annotated[
        Literal["Yes", "No", "Other"],
        Field(description="Tech support"),
    ]

    @computed_field
    @property
    def tenure_range(self) -> str:
        tenure = self.tenure_month
        if tenure == 0:
            return "0-0"
        start = ((tenure - 1) // 12) * 12 + 1
        return f"{start}-{start + 11}"


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"message": "Customer Churn Prediction API is running"}


@app.get("/history")
def get_prediction_history():
    return {"history": load_history()}


@app.delete("/history")
def clear_prediction_history():
    save_history([])
    return {"message": "Prediction history cleared"}


@app.delete("/history/{item_id}")
def delete_prediction_history_item(item_id: str):
    records = load_history()
    filtered = [r for r in records if r.get("id") != item_id]
    save_history(filtered)
    return {"message": "History item deleted", "remaining": len(filtered)}


@app.post("/predict")
def predict_churn(data: UserInput):
    input_df = pd.DataFrame([{
        "contract": data.contract,
        "tenure_month": data.tenure_range,
        "totalcharges": data.totalcharges,
        "paymentmethod": data.paymentmethod,
        "internetservice": data.internetservice,
        "onlinesecurity": data.onlinesecurity,
        "techsupport": data.techsupport,
    }])

    try:
        prediction = model.predict(input_df)[0]
        pred_int = int(prediction)

        record = {
            "id": f"pred_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "contract": data.contract,
            "tenure_month": data.tenure_month,
            "tenure_range": data.tenure_range,
            "totalcharges": data.totalcharges,
            "paymentmethod": data.paymentmethod,
            "internetservice": data.internetservice,
            "onlinesecurity": data.onlinesecurity,
            "techsupport": data.techsupport,
            "prediction": pred_int,
        }

        records = load_history()
        records.insert(0, record)
        save_history(records[:500])

        return {"prediction": pred_int, "record": record}
    except Exception as exc:
        # The full traceback is printed in the Uvicorn terminal.
        logger.exception("Churn prediction failed")
        # Development-friendly response so the frontend can display the cause.
        # Before deploying publicly, replace str(exc) with a generic message.
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc}",
        ) from exc
