# ChurnIQ — Customer Churn Prediction Website

A responsive frontend connected to your FastAPI `/predict` endpoint.

## Project layout

```text
churniq_website/
├── main.py
├── model.pkl        # Add your trained model file here
├── requirements.txt
└── static/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Run locally

1. Put your existing trained `model.pkl` in the same folder as `main.py`.
2. Open a terminal in this folder.
3. Create and activate a virtual environment (recommended).
4. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Start the server:

   ```bash
   uvicorn main:app --reload
   ```

6. Open http://127.0.0.1:8000

The site and API are served from the same FastAPI app, so the frontend can call `/predict` without separate CORS setup. API docs are at http://127.0.0.1:8000/docs.

## Important model checks

- This UI assumes the model output `1` means churn and `0` means no churn. Confirm this matches the label encoding used when you trained your model.
- The website intentionally shows the predicted class only. Your API returns no probability, so the UI does not invent a risk percentage.
- The input values must match the categories and feature preprocessing expected by the trained model. In particular, your code maps tenure months into ranges such as `1-12`, `13-24`, etc.
- `paymentmethod`, `internetservice`, `onlinesecurity`, and `techsupport` choices exactly match your current API schema. If the model was trained with different categories (for example, actual payment-method names), update the schema and form options to match training.
- Only run `joblib.load` on a trusted model file.

## API response

The frontend expects `POST /predict` to return JSON like:

```json
{"prediction": 1}
```


## Debugging HTTP 500 errors

This version logs the full prediction traceback in the Uvicorn terminal and returns a development-friendly JSON `detail` field, which the frontend displays. Re-submit the form and read the terminal output for the precise cause. Do not expose raw exception details in a public production deployment.
