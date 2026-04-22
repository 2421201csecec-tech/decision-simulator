import os


class Settings:
    app_name: str = os.getenv("APP_NAME", "eidoz-core-backend")
    app_env: str = os.getenv("APP_ENV", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()
