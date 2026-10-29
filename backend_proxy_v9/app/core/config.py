from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "controle-becker-corp-proxy-v9"
    app_env: str = "development"
    app_port: int = 6879
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    cors_origins: str = "http://localhost:6777"
    unbound_rpz_file: str = "/etc/unbound/becker/blocked.rpz"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
