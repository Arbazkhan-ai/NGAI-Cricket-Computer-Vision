@echo off
set PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python
cd fastapi_app
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
