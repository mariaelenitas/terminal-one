import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SECRET_KEY", "terminal-one-test-secret")
os.environ.setdefault("DATABASE_URL", "sqlite:///./terminal_one_pytest.db")
os.environ.setdefault("DEMO_MODE", "true")
