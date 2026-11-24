"""Point every test at a separate database, before the app reads its settings.

The API tests create and migrate this database themselves; nothing in your
development database is touched. Override the name with TEST_DB_NAME.
"""

import os

os.environ["DB_NAME"] = os.environ.get("TEST_DB_NAME", "samity_khata_test")
os.environ["RAG_SIMILARITY_THRESHOLD"] = "0.3"  # tuned for the fake embeddings in tests/api