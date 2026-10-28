"""Loopback-only integration fixture. Never use this module as a deployment app."""
import os
import sys
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
if os.environ.get("KEEPERBMA_OPERATIONS_BROWSER_TEST") != "1":
    raise RuntimeError("This test server requires explicit test mode.")

from fastapi import FastAPI, Request, Header, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, text, update
import uvicorn
from backend.business_operations import Operations, metadata, staff as operations_staff
from backend.business_operations_api import create_operations_router, OperationsBodyLimit

temporary = tempfile.TemporaryDirectory(prefix="keeper_ops_browser_")
schema, admin_engine = None, None
if os.environ.get("KEEPERBMA_TEST_POSTGRES_URL"):
    schema = "keeper_ops_browser_" + uuid.uuid4().hex
    admin_engine = create_engine(os.environ["KEEPERBMA_TEST_POSTGRES_URL"])
    with admin_engine.begin() as c:
        c.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(os.environ["KEEPERBMA_TEST_POSTGRES_URL"], connect_args={"options": f"-csearch_path={schema}"})
else:
    engine = create_engine("sqlite:///" + str(Path(temporary.name) / "operations.db").replace("\\", "/"))


@asynccontextmanager
async def lifespan(app):
    yield
    engine.dispose()
    if schema:
        with admin_engine.begin() as c:
            c.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()
    temporary.cleanup()


app = FastAPI(lifespan=lifespan)
app.add_middleware(OperationsBodyLimit)


def owner(request, authorization, business, user):
    if authorization != "Bearer browser-test-owner" or business != 1 or user != 10:
        raise HTTPException(403, "Owner account required")
    return {"business_name": "Integration restaurant"}


def seed(industry="restaurant"):
    metadata.drop_all(engine)
    ops = Operations(engine)
    config = ops.setup(1, 10, "Integration restaurant", "90000", "908172")
    if industry != "unconfigured":
        ops.admin(1,"business_type",{"industry":industry},account_owner=10)
    branch = config["branch"]
    for code, name, role, credential in [("10001", "Manager", "manager", "7351"), ("10002", "Jason", "cashier", "654321"), ("10003", "Kay", "cashier", "123456"), ("10004", "Cook", "kitchen", "456789"), ("10005", "Team member", "staff", "567890")]:
        created = ops.admin(1, "staff", {"branch": branch, "name": name, "code": code, "role": role, "credential": credential}, account_owner=10)
        with engine.begin() as connection:
            connection.execute(update(operations_staff).where(operations_staff.c.id == created["id"]).values(code=code))
    ops.admin(1, "product", {"branch": branch, "name": "Cheeseburger", "sku": "BURGER", "category": "Burgers", "price_cents": 650, "stock": 20}, account_owner=10)
    codes = {}
    for name, mode in [("Cashier 1", "cashier"), ("Cashier 2", "cashier"), ("Kitchen", "kitchen"), ("Time clock", "clock"), ("Office", "office")]:
        codes[name] = ops.enroll(1, branch, name, mode, "account:10")["code"]
    return {"codes": codes, "branch": branch}


fixture = seed()
app.include_router(create_operations_router(lambda: engine, owner, lambda owner, business: None,
    enabled=lambda: True, allowed_origins=["http://127.0.0.1:8767"]))


@app.post("/__test__/reset")
def reset(empty: bool = False, industry: str = "restaurant"):
    global fixture
    if empty:
        metadata.drop_all(engine)
        metadata.create_all(engine)
        fixture = {}
    else:
        fixture = seed(industry)
    return fixture


@app.get("/auth/session")
def account_session(authorization: str | None = Header(default=None)):
    if authorization != "Bearer browser-test-owner":
        raise HTTPException(401, "Account sign-in required")
    return {"user_id": 10, "name": "Test owner"}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie("keeperbma_session")
    return {"ok": True}


app.mount("/", StaticFiles(directory=ROOT, html=True), name="test-pages")
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8767, log_level="warning")
