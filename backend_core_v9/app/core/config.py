from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "controle-becker-corp-core-v9"
    app_env: str = "development"
    app_port: int = 6878
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    cors_origins: str = "http://localhost:6777"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
