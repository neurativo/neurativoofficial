# AI Lecture Assistant Backend

A clean, minimal FastAPI backend for transcribing audio lectures using the OpenAI Whisper API.

## Requirements

- Python 3.11+
- OpenAI API Key
- Supabase URL & Key


## Setup & Installation

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment (optional but recommended):**
    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # Linux/Mac
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Environment Configuration:**
    Create a `.env` file in the `backend` directory based on `.env.example`:
    ```ini
    OPENAI_API_KEY=sk-your-openai-api-key
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_KEY=your-anon-key

    ```

## Running the Application

Start the development server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

## API Documentation

Once the server is running, you can access the interactive API documentation at:

-   Swagger UI: `http://127.0.0.1:8000/docs`
-   ReDoc: `http://127.0.0.1:8000/redoc`

## Usage

### POST /api/v1/transcribe

Upload an audio file to receive the transcription.

**Curl Example:**

```bash
curl -X 'POST' \
  'http://127.0.0.1:8000/api/v1/transcribe' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@/path/to/your/audio.mp3'
```

**Response Example:**

```json
  "lecture_id": "<uuid>",
  "transcript": "This is the transcribed text from the audio file."
}

```
