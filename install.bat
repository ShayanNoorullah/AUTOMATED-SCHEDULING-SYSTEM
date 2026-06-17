@echo off
echo Installing dependencies...
python -m pip install flask flask-sqlalchemy psycopg2-binary cryptography selenium undetected-chromedriver pyperclip
echo.
echo Done! You can now run: run.bat
pause
