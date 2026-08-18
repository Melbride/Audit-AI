

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder


# Maps an HTTP status code to a stable, machine-readable error code for the
# "error" field, used whenever a call site didn't supply one explicitly via
# error_detail(). Anything not listed falls back to a generic "ERROR".
_STATUS_ERROR_CODES = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    500: "SERVER_ERROR",
}


def error_detail(message: str, error_code: str = None, details: dict = None) -> dict:
    """
    Build the rich payload new validators should pass as
    HTTPException(detail=error_detail(...)). The global handler below
    recognizes this shape and passes error_code/details straight through
    instead of inferring them from the status code alone.

    Existing call sites don't need this — a plain string detail= still
    works and gets normalized automatically.
    """
    return {
        "message": message,
        "error_code": error_code,
        "details": details or {},
    }


def _normalize(status_code: int, raw_detail) -> dict:
    """Turn whatever ended up in an HTTPException's `detail` — a plain
    string (the vast majority of existing call sites) or an error_detail()
    dict (new validators) — into the standardized response body."""
    fallback_code = _STATUS_ERROR_CODES.get(status_code, "ERROR")

    if isinstance(raw_detail, dict) and "message" in raw_detail:
        message = raw_detail.get("message")
        error_code = raw_detail.get("error_code") or fallback_code
        details = raw_detail.get("details") or {}
    else:
        message = str(raw_detail)
        error_code = fallback_code
        details = {}

    return {
        "success": False,
        "error": error_code,
        "message": message,
        "details": details,
        # Backward-compat: existing frontend pages read this as a plain string.
        "detail": message,
    }


def register_error_handlers(app) -> None:
    """
    Call once from main.py, right after `app = FastAPI(...)`. Wraps every
    HTTPException raised anywhere in the app — old inline raises and new
    validator modules alike — into the standardized shape, without
    requiring any existing `raise HTTPException(...)` call site to change.
    """

    @app.exception_handler(HTTPException)
    async def _standardized_http_exception_handler(request: Request, exc: HTTPException):
        body = _normalize(exc.status_code, exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=body,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _standardized_validation_exception_handler(request: Request, exc: RequestValidationError):
        # FastAPI's default 422 body puts a LIST of {loc, msg, type, ...}
        # dicts under "detail". Several existing frontend pages (e.g.
        # Users.jsx) render `err.response.data.detail` directly inside
        # JSX — a list of objects there crashes React ("Objects are not
        # valid as a React child"). This became a real, immediate risk the
        # moment field-level validators (phone/email/password) were wired
        # into the Pydantic models, since those now raise exactly this
        # error type on invalid input. So: collapse the list into one
        # readable string for message/detail, and keep the raw structured
        # list under details.errors for any caller that wants per-field
        # info.
        readable_parts = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p != "body"]
            field = ".".join(loc) if loc else "request"
            msg = err.get("msg", "Invalid value.")
            # Pydantic v2 prefixes custom @field_validator ValueErrors with
            # "Value error, " — strip that, it's redundant in a user-facing message.
            if msg.startswith("Value error, "):
                msg = msg[len("Value error, "):]
            readable_parts.append(f"{field}: {msg}" if field != "request" else msg)

        message = " | ".join(readable_parts) if readable_parts else "Request validation failed."

        # exc.errors() can embed the raw exception object under ctx.error
        # for custom @field_validator failures — jsonable_encoder converts
        # that (and anything else non-JSON-native) to a safe, serializable
        # form instead of crashing the response.
        safe_errors = jsonable_encoder(exc.errors())

        body = {
            "success": False,
            "error": "VALIDATION_ERROR",
            "message": message,
            "details": {"errors": safe_errors},
            "detail": message,
        }
        return JSONResponse(status_code=422, content=body)