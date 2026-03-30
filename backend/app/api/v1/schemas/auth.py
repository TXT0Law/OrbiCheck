from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class SessionResponse(BaseModel):
    authenticated: bool
    email: str
