# Agentic LogAI Debugger

A modern Log Analyzer and Code Fix Tool. This repo now includes a React (Vite) frontend and a FastAPI backend, alongside the original Streamlit tooling.

## 🚀 Quick start (React + FastAPI)

1) Backend (FastAPI)
- Create a virtualenv and install deps
  - Windows PowerShell:
    - python -m venv venv
    - .\venv\Scripts\Activate.ps1
    - pip install -r requirements.txt
- Create a .env in repo root as needed (see Keys section below)
- Start API on 127.0.0.1:8000
  - python -m uvicorn backend.services.main:app --host 127.0.0.1 --port 8000 --reload

2) Frontend (Vite + React, JavaScript only)
- cd frontend
- npm install
- npm run dev
- Open http://localhost:5173 (the dev server proxies /api/* → 127.0.0.1:8000)

### Log file upload workflow (file source)
- Go to Logs page in the React app
- Click “Upload log file (file source)” and choose a .log/.txt file
- The backend stores it under data/uploads/<timestamp>_<name> and sets it as the active file
- The current Active file line shows path/size/mtime; queries against source=file use this file
- Metrics and labels also honor this active file when source=file

Tip: You can still point at your own file path via POST /api/logs/source with {"path": "C:\\path\\to\\my.log"}

### Keys and LLM Providers
The toolkit supports multiple providers; set whichever you have:
- OPENAI_API_KEY=...
- GROQ_API_KEY=...
- GOOGLE_API_KEY=...

Place keys in .env (repo root). Backend loads .env at startup.

### Troubleshooting
- Address already in use: ensure ports 8000/5173 are free or change ports.
- IPv6/loopback quirks on Windows: bind FastAPI to 127.0.0.1 and keep the Vite proxy default.
- 500 on frontend calls: confirm backend is running (health: GET /api/health).

## 📸 Screenshots

![screencapture-localhost-8501-2025-04-27-11_48_27](https://github.com/user-attachments/assets/90ae05ea-0fac-4e64-a485-514ab49afe1d)
![Log Analysis](assets/Screenshot%202025-04-27%20at%2011.48.17%E2%80%AFAM.png)
![Error Patterns](assets/Screenshot%202025-04-27%20at%2011.48.50%E2%80%AFAM.png)
![Fix Recommendations](assets/Screenshot%202025-04-27%20at%2011.49.02%E2%80%AFAM.png)
![Comprehensive Dashboard](assets/screencapture-claude-ai-public-artifacts-b288c2b0-e2c2-491d-93f0-2b52f6fd6d22-2025-04-27-11_46_27.png)
![Settings Page](assets/Screenshot%202025-04-25%20at%205.59.08%E2%80%AFPM.png)
![screencapture-localhost-8501-2025-04-27-11_50_09](https://github.com/user-attachments/assets/af6cf5b7-9bf1-438b-9ded-316145b45f9d)
![screencapture-localhost-8501-2025-04-27-11_49_31](https://github.com/user-attachments/assets/7a54cf42-896c-42a3-ba53-b984d71b689f)
![screencapture-claude-ai-public-artifacts-b288c2b0-e2c2-491d-93f0-2b52f6fd6d22-2025-04-27-11_47_33](https://github.com/user-attachments/assets/45d88d9d-b320-4dce-86ca-e6e36e399010)





## Prerequisites

Before you begin, ensure you have the following installed on your system:
- Python 3.10 or higher
- pip (Python package installer)

## Installation

1. Clone the repository:
```bash
git clone <your-repository-url>
cd Log AI
```

2. Create and activate a virtual environment:

For macOS/Linux:
```bash
python -m venv venv
source venv/bin/activate
```

For Windows:
```bash
python -m venv venv
.\venv\Scripts\activate
```

3. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Key Dependencies

The application uses several key packages:
- `streamlit>=1.31.0`: Web application framework
- `pandas>=2.2.0`: Data manipulation and analysis
- `plotly>=5.18.0`: Interactive data visualization
- `matplotlib>=3.8.0`: Static data visualization
- `langchain-community>=0.0.10`: AI/ML workflow management
- `python-dotenv>=1.0.0`: Environment variable management

## Running the Streamlit App (legacy option)

You can still use the Streamlit UI used earlier in this project:

- streamlit run app.py

This opens http://localhost:8501.

## Environment Variables

If the application requires any API keys or configuration, create a `.env` file in the root directory with the following format:

```
API_KEY=your_api_key_here
OTHER_CONFIG=other_value
```

## Project Structure

```
spark/
├── app.py              # Main application file
├── requirements.txt    # Project dependencies
├── venv/              # Virtual environment (not tracked in git)
├── .env               # Environment variables (not tracked in git)
└── README.md          # This file
```

## Smart Log Analyzer

The Smart Log Analyzer helps you analyze log files and identify error patterns using AI.

─────────────────────────────── Instructions ────────────────────────────────
Welcome to Smart Log Analyzer

This tool helps you analyze log files and identify error patterns using AI. Here's how to get the most out of it:

1. Basic review - Quick analysis without code examination
2. In-depth review - Comprehensive analysis with source code fixes

You can analyze all detected log files or pick specific ones by index. The tool will suggest fixes and provide insights about error patterns.
─────────────────────────────────────────────────────────────────────────────

### Usage Flow
- The tool searches for log files in the project (recursive, max depth: 4).
- Found log files are listed with their index and size.
- You can select a review mode:
  1. Basic log review (fast, log-only): Analyzes log files without examining source code - quick analysis of error patterns.
  2. In-depth review with code fixes (slower, analyzes source files): Deep analysis with source code examination and suggested code fixes for errors.
- Choose to process all log files or select specific ones by index.
- The tool will analyze and provide suggestions or fixes.

### Example Output
```
Found 1 log file(s).
┏━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┓
┃ Index ┃ Log File                                       ┃ Size      ┃
┡━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━┩
│ 1     │ ./simulator/log_generator/simulated_system.log │ 346.79 KB │
└───────┴────────────────────────────────────────────────┴───────────┘

Available Review Modes:
1. Basic log review (fast, log-only)
2. In-depth review with code fixes (slower, analyzes source files)

Available Actions:
1. Process all log files
2. Select specific log file(s)
3. Exit
```

### Note on LangChain Deprecation
You may see the following warning:
```
LangChainDeprecationWarning: The class `ChatOpenAI` was deprecated in LangChain 0.0.10 and will be removed in 1.0. An updated version of the class exists in the :class:`~langchain-openai package and should be used instead. To use it run `pip install -U :class:`~langchain-openai` and import as `from :class:`~langchain_openai import ChatOpenAI``.
```
This does not affect the current functionality, but you may wish to update your dependencies in the future.

### Running with Docker
To run the log analysis stack (Loki, Promtail, Grafana) using Docker Compose, use the following commands:

Start all services in the background:
```bash
docker-compose up -d
```

Check the status of running containers:
```bash
docker-compose ps
```

Stop all services:
```bash
docker-compose down
```

### Running the CLI Agent
To use the Smart Log Analyzer CLI agent, navigate to the `agent` directory and run:

```bash
cd agent
python cli.py
```

You can also use the following options:
- Analyze a specific log file:
  ```bash
  python cli.py --log-file path/to/your.log
  ```
- Search recursively for log files:
  ```bash
  python cli.py --recursive
  ```
- Specify a directory to search:
  ```bash
  python cli.py --directory path/to/dir
  ```

### Running the Dashboard
To run the analytics dashboard:

1. Start the required backend services (Loki, Promtail, Grafana) using Docker Compose:
   ```bash
   docker-compose up -d
   ```

2. Once Docker services are running, launch the dashboard (from the `agent` directory):
   ```bash
   streamlit run app2.py
   ```

The dashboard will be available at [http://localhost:8501](http://localhost:8501).

### React + FastAPI details

- Backend entry: backend/services/main.py (FastAPI)
- Frontend: frontend/ (Vite + React, JS only)
- Proxy: Vite dev server proxies /api/* to 127.0.0.1:8000
- Upload & source endpoints:
  - GET /api/logs/source → { active_file, exists, size, mtime }
  - POST /api/logs/source { path } → set active file
  - POST /api/logs/upload (multipart file) → store under data/uploads and set active file

## Contributing

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to your branch
5. Create a Pull Request
