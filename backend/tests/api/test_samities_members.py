from tests.api.conftest import make_member


async def test_samity_crud_and_roles(client, users, samity):
    sid = samity["id"]
    assert (await client.get(f"/samities/{sid}", headers=users.staff)).status_code == 200
    assert (await client.get("/samities/999", headers=users.staff)).status_code == 404
    assert (await client.get("/samities", headers=users.customer)).status_code == 403

    dup = await client.post(
        "/samities", json={"name": "Shapla Samity", "union": "X", "monthly_deposit_paisa": 50000}, headers=users.admin
    )
    assert dup.status_code == 409
    staff_create = await client.post(
        "/samities", json={"name": "Other", "union": "X", "monthly_deposit_paisa": 50000}, headers=users.staff
    )
    assert staff_create.status_code == 403

    r = await client.patch(f"/samities/{sid}", json={"union": "Rupnagar"}, headers=users.admin)
    assert r.status_code == 200 and r.json()["union"] == "Rupnagar"
    assert (await client.patch(f"/samities/{sid}", json={"name": None}, headers=users.admin)).status_code == 422


async def test_create_member_rules(client, users, samity, own):
    assert own["status"] == "active" and own["user_id"] == users.customer_id
    body = {"samity_id": samity["id"], "member_no": "SSR-0001", "name": "Dup", "phone": "01712345678"}
    assert (await client.post("/members", json=body, headers=users.admin)).status_code == 409
    assert (await client.post("/members", json=body | {"samity_id": 999, "member_no": "X1"}, headers=users.admin)).status_code == 404
    assert (await client.post("/members", json=body | {"member_no": "X2"}, headers=users.staff)).status_code == 403
    assert (await client.post("/members", json=body | {"member_no": "X3", "phone": "123"}, headers=users.admin)).status_code == 422
    future = body | {"member_no": "X4", "joined_on": "2999-01-01"}
    assert (await client.post("/members", json=future, headers=users.admin)).status_code == 422


async def test_list_members_filters_and_pagination(client, users, samity):
    for i in range(1, 6):
        await make_member(client, users, samity, f"SSR-000{i}")
    await client.patch("/members/5", json={"status": "inactive"}, headers=users.admin)

    page = (await client.get("/members", params={"size": 2, "page": 2}, headers=users.staff)).json()
    assert page["total"] == 5 and page["page"] == 2 and len(page["items"]) == 2

    inactive = (await client.get("/members", params={"status": "inactive"}, headers=users.staff)).json()
    assert [m["member_no"] for m in inactive["items"]] == ["SSR-0005"]
    found = (await client.get("/members", params={"q": "0003", "samity_id": samity["id"]}, headers=users.staff)).json()
    assert [m["member_no"] for m in found["items"]] == ["SSR-0003"]
    assert (await client.get("/members", params={"size": 500}, headers=users.staff)).status_code == 422
    assert (await client.get("/members", headers=users.customer)).status_code == 403


async def test_get_member_access(client, users, own, other):
    assert (await client.get(f"/members/{own['id']}", headers=users.customer)).status_code == 200
    assert (await client.get(f"/members/{other['id']}", headers=users.customer)).status_code == 403
    assert (await client.get(f"/members/{other['id']}", headers=users.staff)).status_code == 200
    assert (await client.get("/members/999", headers=users.admin)).status_code == 404
    assert (await client.get(f"/members/{own['id']}")).status_code == 401


async def test_update_and_delete_member(client, users, own):
    r = await client.patch(f"/members/{own['id']}", json={"name": "Rahima B."}, headers=users.admin)
    assert r.status_code == 200 and r.json()["name"] == "Rahima B."
    assert (await client.patch(f"/members/{own['id']}", json={"name": "x"}, headers=users.staff)).status_code == 403

    await client.post("/transactions", json={"member_id": own["id"], "type": "deposit", "amount_paisa": 100}, headers=users.staff)
    assert (await client.delete(f"/members/{own['id']}", headers=users.admin)).status_code == 409  # has records
    assert (await client.delete("/members/999", headers=users.admin)).status_code == 404