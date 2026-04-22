from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "controle-becker-corp-core-v9"
    app_env: str = "development"
    app_port: int = 6878
    database_url: str = "postgresql+psycopg://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v9"
    jwt_secret: str = "change_me"
    jwt_algorithm: str = "HS256"
    cors_origins: str = "http://localhost:6777"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
